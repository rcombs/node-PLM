var events = require("events"),
//	stream = require("stream"), // Not using streams now; may later
	SerialPort = require("serialport").SerialPort,
	CONSTANTS = require("./constants.js"),
	util = require("./util.js"),
	INSTEONMessage = require("./INSTEONMessage.js"),
	INSTEONMessageFlags = require("./INSTEONMessageFlags.js"),
	INSTEONMessageCommand = require("./INSTEONMessageCommand.js");

var PLM = module.exports = function PLM(path, cb){
	if(!(this instanceof PLM)){ 
		return new PLM(path, cb);
	}
	var self = this;
	
	if(cb){
		this.once("connected", cb);
	}
	
	this.queue = [];
	
	this.INSTEONQueue = [];
	
	this.busy = this.INSTEONBusy = false;
	
	var serial = this.serial = new SerialPort(path, {
		// Serial port settings for standard IM (serial or USB)
		baudrate: 19200,
		databits: 8,
		parity: "none",
		stopbits: 1
	});
	
	serial.on("error", function(err){
		// Emit serialport errors on ourself
		self.emit("error", err);
	});
	serial.on("open", function(){
		// Send GET_IM_INFO to fetch our INSTEON ID
		self.sendCommand([CONSTANTS.PLM_COMMANDS.GET_IM_INFO], function(error, ret){
			if(error){
				return self.emit("error", error);
			}
			self.PLM_ID = ret.slice(0,3);
			self.emit("connected", {
				id: self.PLM_ID,
				deviceCategory: ret[3],
				deviceSubcategory: ret[4],
				firmwareVersion: ret[5]
			});
		});
	});
	
	serial.on("data", function(buf){
		self.emit("raw", buf);
	});
	
	this.rawBuffer = new Buffer(0);
	
	this.on("raw", function(buf){
		self.rawBuffer = Buffer.concat([this.rawBuffer, buf], this.rawBuffer.length + buf.length);
		var messageLength = 0;
		while(messageLength = util.getMessageLength(
			self.rawBuffer = util.stripUntilStarts(self.rawBuffer, CONSTANTS.STX)
		)){ // Search for all messages
			self.emit("message", self.rawBuffer.slice(0, messageLength + 1));
			self.rawBuffer = self.rawBuffer.slice(messageLength + 1); // Remove complete messages from buffer
		}
	});
	
	this.on("message", function(buf){
		if(buf[0] != CONSTANTS.STX){
			return false; // All messages should start with an STX byte
		}
		if(buf[1] < CONSTANTS.MIN_OUT_COMMAND){
			// Sent by IM; not an echo
			// Emit an event named by the command number
			self.emit(buf[1], buf.slice(2));
			self.emit("incoming", buf.slice(1));
		}else{
			// Echo/Reply to a command from host
			// Move ahead in queue
			var ACK = buf[buf.length - 1] == CONSTANTS.ACK;
			// Emit an echo event with the ACK/NAK status,
			// the command number, and the actual data
			self.emit("reply", ACK ? false : new Error("MODEM_NAK"), buf.slice(2, buf.length - 1), buf[1]);
			this.busy = false; // PLM only sends replies when no longer busy
			self.dequeue();
		}
	});
	
	function handleMsgEvent(buf){
		var msg = new INSTEONMessage(buf);
		// All messages get the generic event
		self.emit("INSTEON message", msg);
		if(!util.buffersEqual(msg.to, self.PLM_ID)){
			self.emit("INSTEON monitor message");
		}
		if(msg.flags.ACK){
			// Emit a generic ACK event with the whole message
			self.emit("INSTEON ACK", msg);
			if(msg.flags.group){
				self.emit("INSTEON group ACK", msg);
			}else{
				if(!util.buffersEqual(msg.to, self.PLM_ID)){
					self.emit("INSTEON monitor direct ACK");
					return; // Regular ACK: events don't fire for monitor mode
				}
				self.emit("INSTEON direct ACK", msg);
				// And one named for the device it came from
				// (Used for the PLM.sendINSTEON callback)
				self.emit("ACK:" + msg.from.toString("hex"), msg);
			}
		}else if(msg.flags.broadcast){
			self.emit("INSTEON broadcast message", msg);
		}else if(msg.flags.group){
			self.emit("INSTEON group message", msg);
		}else{
			if(!util.buffersEqual(msg.to, self.PLM_ID)){
				self.emit("INSTEON monitor direct message");
				return; // Regular message events don't fire for monitor mode
			}
			self.emit("INSTEON direct message", msg);
		}
	}
	
	this.on(CONSTANTS.PLM_COMMANDS.INSTEON_STD_RECV, handleMsgEvent);
	this.on(CONSTANTS.PLM_COMMANDS.INSTEON_EXT_RECV, handleMsgEvent);
	
	this.on(CONSTANTS.PLM_COMMANDS.ALL_LINKING_COMPLETED, function(data){
		this.emit("all_linking_completed", false, {
			type: data[0],
			group: data[1],
			id: data.slice(2, 5),
			category: data[5],
			subcategory: data[6],
			firmware_version: data[7]
		});
	});
	
	return this;
}

PLM.CONSTANTS = CONSTANTS;
PLM.util = util;
PLM.INSTEONMessage = INSTEONMessage;
PLM.INSTEONMessageFlags = INSTEONMessageFlags;
PLM.INSTEONMessageCommand = INSTEONMessageCommand;

PLM.prototype = new events.EventEmitter();

PLM.prototype.linkINSTEONDevice = function linkINSTEONDevice(mode, group, cb){
	var self = this;
	this.sendCommand([CONSTANTS.PLM_COMMANDS.START_ALL_LINKING, mode, group], function(err, reply_data, cmd_number){
		if(err){
			return cb(err);
		}
		self.once("all_link_finished", cb);
	});
};

PLM.prototype.cancelLinking = function cancelLinking(cb){
	var self = this;
	this.sendCommand([CONSTANTS.PLM_COMMANDS.CANCEL_ALL_LINKING], function(err, reply_data, cmd_number){
		if(err){
			return cb && cb(err);
		}
		self.emit("all_link_finished", (new Error("CANCELED")));
		cb(false);
	});
}

PLM.prototype.sendINSTEON = function sendINSTEON(message, cb, jump){
	var self = this;
	message = new INSTEONMessage(message);
	if(jump){
		this.INSTEONQueue.unshift({message: message, callback: cb});
	}else{
		this.INSTEONQueue.push({message: message, callback: cb});
	}
	return this.INSTEONDequeue();
};

PLM.prototype.sendINSTEONNow = function sendINSTEONNow(message, cb){
	var self = this;
	// Callback gets 2 args:
	// 1. Error
	// 2. Reply message object
	message = new INSTEONMessage(message);
	var data = new Buffer(message.length + 1);
	data[0] = CONSTANTS.PLM_COMMANDS.SEND_INSTEON; // Prefix the SEND_INSTEON command number
	message.copy(data, 1);
	this.sendCommand(data, cb);
};

PLM.prototype.sendCommand = function sendCommand(cmd, cb, jump){
	var buf = new Buffer(cmd);
	if(jump){
		this.queue.unshift({command: buf, callback: cb});
	}else{
		this.queue.push({command: buf, callback: cb});
	}
	return this.dequeue();
};

PLM.prototype.INSTEONDequeue = function INSTEONDequeue(){
	var self = this;
	if(this.INSTEONBusy){
		return false;
	}
	var cmd = this.INSTEONQueue.shift();
	if(!cmd){
		return;
	}
	var cb = cmd.callback;
	var message = cmd.message;
	var to = (new Buffer(message.to)).toString("hex");
	var extended = message.flags.extended;
	var timeoutDuration = (extended ? self.INSTEONExtendedTimeout : self.INSTEONStandardTimeout) || false;
	this.sendINSTEONNow(cmd.message, function(err, data, cmdnum){
		if(err){
			self.INSTEONBusy = false;
			self.INSTEONDequeue();
			if(cb){
				cb(err, data, cmdnum);
			}
			return;
		}
		// If everything's fine, set up a timeout (if enabled) and event listener
		var timeout, callback = function(reply){
			self.INSTEONBusy = false;
			if(cb){
				if(reply.flags.NAK){
					cb(new Error("DEVICE_NAK"), reply);
				}else{
					cb(false, reply);
				}
			}
			if(timeoutDuration){
				clearTimeout(timeout);
			}
			self.removeListener("ACK:" + to, callback);
			self.INSTEONDequeue();
		};
		self.on("ACK:" + to, callback);
		if(timeoutDuration){
			timeout = setTimeout(function(){
				self.INSTEONBusy = false;
				self.removeListener("ACK:" + to, callback);
				if(cb){
					cb(new Error("DEVICE_TIMEOUT"));
				}
				self.INSTEONDequeue();
			}, timeoutDuration);
		}
	});
	return this.INSTEONBusy = true;
}

PLM.prototype.dequeue = function dequeue(){
	var self = this;
	if(this.busy){
		return false; // Refuse to dequeue when the PLM is busy
	}
	var cmd = this.queue.shift();
	if(!cmd){
		return; // Queue was empty
	}
	this.sendCommandNow(cmd.command, function(){
		// Deal with timeouts if we have to
		if(self.commandTimeout){
			var timeout, callback = function(err, replyData, commandNumber){
				// "reply" event listener
				if(cmd.callback){
					// If we've got an actual callback function, call it
					cmd.callback(err, replyData, commandNumber);
				}
				// Event came. Clear timeout and remove this listener.
				clearTimeout(timeout);
				self.removeListener("reply", callback);
			}
			timeout = setTimeout(function(){
				// Event didn't come in time.
				if(cmd.callback){
					// If we've got an actual callback function, call it
					cmd.callback(new Error("MODEM_TIMEOUT"), false, false);
				}
				// Remove the regular callback so we don't double up.
				self.removeListener("reply", callback);
				// Advance queue; there's a chance this'll cause more errors 0.o
				self.dequeue();
			}, self.commandTimeout);
			self.on("reply", callback);
		}else{
			// If timeouts are disabled, just use `.once`
			self.once("reply", cmd.callback);
		}
	});
	return this.busy = true;
};

PLM.prototype.commandTimeout = 250;

PLM.prototype.INSTEONStandardTimeout = PLM.prototype.X10Timeout = 2500;

PLM.prototype.INSTEONExtendedTimeout = 5000;

PLM.prototype.sendCommandNow = function sendCommandNow(cmd, cb){
	var data;
	if(cmd[0] !== CONSTANTS.STX){
		data = new Buffer(cmd.length + 1);
		data[0] = CONSTANTS.STX;
		cmd.copy(data, 1);
	}else{
		data = cmd;
	}
	this.sendRaw(data, cb);
}

PLM.prototype.sendRaw = function sendRaw(data, cb){
	this.serial.write(new Buffer(data), cb);
}

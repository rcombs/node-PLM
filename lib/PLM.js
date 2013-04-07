var events = require("events"),
//	stream = require("stream"), // Not using streams now; may later
	SerialPort = require("serialport").SerialPort,
	CONSTANTS = require("./constants.js"),
	util = require("./util.js"),
	INSTEONMessage = require("./INSTEONMessage.js"),
	INSTEONMessageFlags = require("./INSTEONMessageFlags.js");

var PLM = module.exports = function(path, cb){
	var self = this;
	
	if(cb){
		this.once("connected", cb);
	}
	
	this.queue = [];
	
	this.busy = false;
	
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
		self.sendCommand([CONSTANTS.PLM_COMMANDS.GET_IM_INFO], function(status, ret){
			if(status){
				self.PLM_ID = ret.slice(0,3);
				self.emit("connected", {
					id: self.PLM_ID,
					deviceCategory: ret[3],
					deviceSubcategory: ret[4],
					firmwareVersion: ret[5]
				});
			}else{
				self.emit("error", new Error("GET_IM_INFO returned NAK"));
			}
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
			this.busy = false; // PLM only sends replies when no longer busy
		}else{
			// Echo/Reply to a command from host
			// Move ahead in queue
			var ACK = buf[buf.length - 1] == CONSTANTS.ACK;
			// Emit an echo event with the ACK/NAK status,
			// the command number, and the actual data
			self.emit("reply", ACK, buf.slice(2, buf.length - 1), buf[1]);
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
	
	return this;
}

PLM.CONSTANTS = CONSTANTS;

PLM.util = util;

PLM.INSTEONMessage = INSTEONMessage;

PLM.INSTEONMessageFlags = INSTEONMessageFlags;

PLM.prototype = new events.EventEmitter();

PLM.prototype.sendINSTEON = function(message, cb){
	var self = this;
	// Callback gets 2 args:
	// 1. Error
	// 2. Reply message object
	var msgbuf = INSTEONMessage.makeBuffer(message);
	var data = new Buffer(msgbuf.length + 1);
	data[0] = CONSTANTS.PLM_COMMANDS.SEND_INSTEON; // Prefix the SEND_INSTEON command number
	msgbuf.copy(data, 1);
	var to = (new Buffer(message.to)).toString("hex");
	this.sendCommand(data, function(ACK, data, cmdnum){
		if(cb){
			if(!data){
				return cb(new Error("MODEM_TIMEOUT"));
			}else if(!ACK){
				return cb(new Error("MODEM_NAK"));
			}
			// If everything's fine, set up a timeout (if enabled) and event listener
			var timeout, callback = function(reply){
				if(reply.flags.NAK){
					cb(new Error("DEVICE_NAK"), reply);
				}else{
					cb(false, reply);
				}
				if(self.INSTEONTimeout){
					clearTimeout(timeout);
				}
				self.removeListener("ACK:" + to, callback);
			};
			self.on("ACK:" + to, callback);
			if(self.INSTEONTimeout){
				timeout = setTimeout(function(){
					self.removeListener("ACK:" + to, callback);
					cb(new Error("DEVICE_TIMEOUT"));
				}, self.INSTEONTimeout);
			}
		}
	});
}

PLM.prototype.sendCommand = function(cmd, cb, jump){
	var buf = new Buffer(cmd);
	if(jump){
		this.queue.unshift({command: buf, callback: cb});
	}else{
		this.queue.push({command: buf, callback: cb});
	}
	return this.dequeue();
};

PLM.prototype.dequeue = function(){
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
			var timeout, callback = function(status, replyData, commandNumber){
				// "reply" event listener
				if(cmd.callback){
					// If we've got an actual callback function, call it
					cmd.callback(status, replyData, commandNumber);
				}
				// Event came. Clear timeout and remove this listener.
				clearTimeout(timeout);
				self.removeListener("reply", callback);
			}
			timeout = setTimeout(function(){
				// Event didn't come in time.
				if(cmd.callback){
					// If we've got an actual callback function, call it
					cmd.callback(false, false, false);
				}
				// Remove the regular callback so we don't double up.
				self.removeListener("reply", callback);
				// Advance queue; there's a chance this'll cause more errors 0.o
				self.dequeue();
			}, self.commandTimeout);
			self.on("reply", callback);
		}else{
			// If timeouts are disabled, just use `.once`
			self.once("rely", cmd.callback);
		}
	});
	return true;
};

PLM.prototype.commandTimeout = 250;

PLM.prototype.INSTEONTimeout = PLM.prototype.X10Timeout = 2000;

PLM.prototype.sendCommandNow = function(cmd, cb){
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

PLM.prototype.sendRaw = function(data, cb){
	this.serial.write(new Buffer(data), cb);
}
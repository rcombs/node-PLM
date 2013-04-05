var events = require("events"),
//	stream = require("stream"), // Not using streams now; may later
	SerialPort = require("serialport").SerialPort;

var CONSTANTS = require("./constants.js");

var util = require("./util.js");

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
		self.sendCommand([CONSTANTS.CMDS.GET_IM_INFO], function(status, ret){
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
		while(messageLength = util.getIMMessage(
			self.rawBuffer = stripUntilStarts(self.rawBuffer, CONSTANTS.STX)
		)){ // Search for all messages
			self.emit("message", message.slice(0, messageLength + 1));
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
			this.busy = false; // PLM only sends replies when no longer busy
		}else{
			// Echo/Reply to a command from host
			// Move ahead in queue
			var ACK = buf[buf.length - 1] == CONSTANTS.ACK;
			// Emit an echo event with the ACK/NAK status,
			// the command number, and the actual data
			self.emit("echo", ACK, buf.slice(2, buf.length - 1), buf[1]);
			self.dequeue();
		}
	});
	
	function handleMsgEvent(buf){
		var msg = util.parseINSTEONMsg(buf);
		// All messages get the generic event
		self.emit("INSTEON message", msg);
		if(msg.flags.ACK){
			// Emit a generic ACK event with the whole message
			self.emit("INSTEON ACK", msg);
			// And one named for the device it came from
			// (Used for the PLM.sendINSTEON callback)
			self.emit("ACK:" + msg.from.toString("hex"), msg);
			if(msg.flags.group){
				self.emit("INSTEON group ACK", msg);
			}else{
				self.emit("INSTEON direct ACK", msg);
			}
		}else if(msg.flags.broadcast){
			self.emit("INSTEON broadcast message", msg);
		}else if(msg.flags.group){
			self.emit("INSTEON group message", msg);
		}else{
			self.emit("INSTEON direct message", msg);
		}
	}
	
	this.on(CONSTANTS.INSTEON_STD_RECV, handleMsgEvent);
	this.on(CONSTANTS.INSTEON_EXT_RECV, handleMsgEvent);
	
	return this;
}

PLM.CONSTANTS = CONSTANTS;

PLM.util = util;

PLM.prototype = new events.EventEmitter();

PLM.prototype.sendINSTEON = function(message, cb){
	// Should we provide 2 callbacks here? (Probably not?)
	var msgbuf = util.makeINSTEONMsg(message);
	var data = new Buffer(msgbuf.length + 1);
	data[0] = CONSTANTS.CMDS.SEND_INSTEON; // Prefix the SEND_INSTEON command number
	msgbuf.copy(data, 1);
	this.sendCommand(data);
}

PLM.prototype.sendCommand = function(cmd, cb){
	this.queue.push({command: new Buffer(cmd), callback: cb});
	return this.dequeue();
};

PLM.prototype.dequeue = function(cb){
	if(this.busy){
		return false; // Refuse to dequeue when the PLM is busy
	}
	var cmd = this.queue.shift();
	if(!cmd){
		return; // Queue was empty
	}
	if(cmd.callback){
		this.once("echo", cmd.callback);
	}
	this.sendCommandNow(cmd.command, cb);
	return true;
};

PLM.prototype.sendCommandNow = function(cmd, cb){
	var data = new Buffer(cmd.length + 1);
	data[0] = CONSTANTS.STX;
	cmd.copy(data, 1);
	this.sendRaw(data, cb);
}

PLM.prototype.sendRaw = function(data, cb){
	this.serial.write(data, cb);
}
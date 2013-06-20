var INSTEONMessageFlags = require("./INSTEONMessageFlags.js"),
	INSTEONMessageCommand = require("./INSTEONMessageCommand.js"),
	util = require("./util.js");

var INSTEONMessage = module.exports = function INSTEONMessage(message){
	var from = new Buffer(3);
	Object.defineProperties(this, {
		from: {
			set: function(value){
				return from = (Buffer.isBuffer(value) || Array.isArray(value)) ? new Buffer(value) : new Buffer(3);
			},
			get: function(){
				return from;
			}
		},
		to: {
			set: function(value){
				var data = (Buffer.isBuffer(value) || Array.isArray(value)) ? new Buffer(value) : new Buffer(3);
				if(data){
					data.copy(this);
				}
				return data;
			},
			get: function(){
				return this.slice(0, 3);
			}
		},
		deviceCategory: {
			set: function(value){
				var data = this[0] & 0x0F;
				data |= value << 4;
				this[0] = data;
				return value;
			},
			get: function(){
				return this[0] >>> 4;
			}
		},
		deviceDescriptor: {
			set: function(value){
				var data = this.readUInt16BE(0) & 0xF000;
				data |= value;
				this.writeUInt16BE(data, 0);
				return value;
			},
			get: function(){
				return this.readUInt16BE(0) & 0x0FFF;
			}
		},
		group: {
			set: function(value){
				this.fill(0, 0, 2);
				return this[2] = value;
			},
			get: function(){
				return this[2];
			}
		},
		firmwareVersion: {
			set: function(value){
				this.fill(0, 0, 2);
				return this[2] = value;
			},
			get: function(){
				return this[2];
			}
		},
		flags: {
			set: function(value){
				return this[3] = (new INSTEONMessageFlags(value)).valueOf();
			},
			get: function(){
				return new INSTEONMessageFlags(this[3]);
			}
		},
		command: {
			set: function(value){
				var data = new INSTEONMessageCommand(value);
				console.log(data);
				data.copy(this, 5);
				console.log((new Buffer(this)).toString("hex"));
				return data;
			},
			get: function(){
				return new INSTEONMessageCommand(this.slice(5, 7));
			}
		},
		userData: {
			set: function(value){
				var data = (Buffer.isBuffer(value) || Array.isArray(value)) ? new Buffer(value) : false;
				if(data){
					this.extended = true;
					data.copy(this, 6);
				}else{
					this.extended = false;
				}
				return data;
			},
			get: function(){
				if(!this.extended){
					return false;
				}
				return this.slice(6);
			}
		},
		length: {
			get: function(){
				return this.extended ? 20 : 6;
			}
		},
		extended: {
			set: function(value){
				return this.flags.extended = !!value;
			},
			get: function(){
				return this.flags.extended;
			}
		}
	});
	if(Buffer.isBuffer(message) || Array.isArray(message)){
		var parsed = INSTEONMessage.parseBuffer(message);
		this.extended = parsed.extended;
		from = parsed.from;
		(new INSTEONMessage(parsed)).copy(this);
	}else{
		from = message.from;
		this.to = message.to;
		this.flags = message.flags;
		this.userData = message.userData;
		if(this.flags.group){
			this.group = message.group;
		}else if(this.flags.broadcast){
			this.deviceCategory = message.deviceCategory;
			this.deviceSubcategory = message.deviceSubcategory;
			this.firmwareVersion = message.firmwareVersion;
		}else{
			this.command = message.command;
		}
	}
};

INSTEONMessage.isINSTEONMessage = function isINSTEONMessage(message){
	if(!(Buffer.isBuffer(message))){
		return false;
	}
	if([6, 20].indexOf(message.length) == -1){
		return false;
	}
	return true;
}

INSTEONMessage.parseBuffer = function(buf){
	var buf2 = new Buffer(buf);
	if(buf.length == 6 || buf.length == 20){
		// Outgoing buffer; set from-address bytes to 0x00
		buf = new Buffer(buf.length + 3);
		buf.fill(0, 0, 4);
		buf2.copy(buf, 4);
	}else{
		buf = buf2;
	}
	var flags = new INSTEONMessageFlags(buf[6]);
//	var command = INSTEONMessage.makeCommand(buf.slice(7, 9));
	var command = buf.slice(7, 9);
	if(flags.group){
		return {
			from: buf.slice(0, 3),
			flags: flags,
			group: buf[5],
			command: command,
			userData: (buf.length > 8) ? buf.slice(9) : undefined
		};
	}else if(flags.broadcast){
		var devType = buf.readUInt16BE(3);
		return {
			from: buf.slice(0, 3),
			flags: flags,
			deviceCategory: devType >>> 12, // High 4 bits
			deviceDescriptor: devType & 0xFFF, // Low 12 bits
			firmwareRevision: buf[5],
			command: command,
			userData: (buf.length > 8) ? buf.slice(9) : undefined
		};
	}else{
		return {
			from: buf.slice(0, 3),
			to: buf.slice(3, 6),
			flags: flags,
			command: command,
			userData: (buf.length > 8) ? buf.slice(9) : undefined
		};
	}
}

INSTEONMessage.prototype = new Buffer(20);

INSTEONMessage.prototype.inspect = function(){
	return require("util").inspect(INSTEONMessage.parseBuffer(this));
}

var INSTEONMessageFlags = require("./INSTEONMessageFlags.js");

var INSTEONMessage = module.exports = function(message){
	if(Buffer.isBuffer(message) || Array.isArray(message)){
		message = INSTONMessage.parseBuffer(message);
	}
	this.from = (message.from && message.from.length) ? new Buffer(message.from) : undefined;
	this.to = (message.to && message.to.length) ? new Buffer(message.to) : undefined;
	this.flags = new INSTEONMessageFlags(message.flags);
	this.command = (message.command && message.command.length) ? new Buffer(message.command) : undefined;
	this.userData = (message.userData && message.userData.length) ? new Buffer(message.userData) : undefined;
	this.group = message.group;
	this.deviceCategory = message.deviceCategory;
	this.deviceSubcategory = message.deviceSubcategory;
	this.firmwareVersion = message.firmwareVersion;
	return this;
};

INSTEONMessage.isINSTEONMessage = function(message){
	if(typeof message !== "object"){
		return false;
	}
	if(!(Buffer.isBuffer(message.from) || Buffer.isBuffer(message.to))){
		return false;
	}
	if(!Buffer.isBuffer(message.command) && (message.deviceCategory === undefined || message.deviceSubcategory === undefined || message.deviceVersion === undefined)){
		return false;
	}
	if(!message.flags){
		return false;
	}
	return true;
}

INSTEONMessage.makeBuffer = function(msg){
	var extended = "userData" in msg;
	
	var buf = new Buffer(extended ? 20 : 6);
	
	var parsedFlags = new INSTEONMessageFlags(msg.flags);
	var flags = parsedFlags.toBitmask();
	
	if(msg.to){
		(new Buffer(msg.to)).copy(buf, 0);
	}else if(parsedFlags.broadcast){
		var devType = msg.deviceCategory | 0;
		devType <<= 12;
		devType |= msg.deviceDescriptor;
		buf.writeUInt16BE(devType, 0);
		buf[2] = msg.firmwareRevision | 0;
	}else if(parsedFlags.group){
		buf.fill(0, 0, 2);
		buf[2] = msg.group;
	}
	buf[3] = flags;
	// We support 3 types of input for commands:
	// 1. Object with `command.number` and `command.data` map to the command 1 and command 2 fields (simple)
	// 2. `Array` or `Buffer` containing both (standard)
	// 3. `number` containing just the command number (data = 0x00)
	if(msg.command.number){
		buf[4] = msg.command.number;
		buf[5] = msg.command.data || 0;
	}else if(typeof msg.command == "number"){
		buf[4] = msg.command;
		buf[5] = 0;
	}else{
		(new Buffer(msg.command)).copy(buf, 4);
		if(msg.command.length == 1){
			buf[5] = 0;
		}
	}
	if(extended){
		(new Buffer(msg.userData)).copy(buf, 6);
	}
	
	return buf;
}

INSTEONMessage.parseBuffer = function(buf){
	buf = new Buffer(buf);
	var flags = new INSTEONMessageFlags(buf[6]);
	var command = buf.slice(7, 9);
	command.number = buf[7];
	command.data = buf[8];
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

INSTEONMessage.prototype.toBuffer = function(){
	return INSTEONMessage.makeBuffer(this);
}
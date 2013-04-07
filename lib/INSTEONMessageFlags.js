var util = require("./util.js");

var INSTEONMessageFlags = module.exports = function(flags){
	flags = INSTEONMessageFlags.parse(flags);
	this.broadcast = flags.broadcast || false;
	this.group = flags.group || false;
	this.ACK = flags.ACK || false;
	this.NAK = flags.NAK || false;
	this.extended = flags.extended || false;
	this.hopsLeft = flags.hopsLeft || 3;
	this.maxHops = flags.maxHops || this.hopsLeft;
	return this;
}

INSTEONMessageFlags.parse = function(flags){
	if(!flags){
		return {};
	}
	if(typeof flags == "object"){
		return flags;
	}
	var arr = util.parseBitmask(flags);
	return {
		broadcast: (arr[7] && !(arr[6] || arr[5])) || false,
		group: arr[6] || false,
		ACK: (arr[5]) || false, // NOTE: ACK field is either ACK or NAK!
		NAK: (arr[5] &&  arr[7]) || false,
		extended: arr[4] || false,
		hopsLeft: util.makeBitmask(arr.slice(2, 2)) || 0,
		maxHops: util.makeBitmask(arr.slice(0, 2)) || 0
	};
};

INSTEONMessageFlags.makeBitmask = function(flags){
	if(Buffer.isBuffer(flags) || Array.isArray(flags)){
		return new Buffer(flags);
	}
	var out = util.makeBitmask([flags.extended, flags.ACK || flags.NAK, flags.group, flags.broadcast || flags.NAK]) << 4;
	
	flags.maxHops = isNaN(flags.maxHops) ? 3 : flags.maxHops;
	
	if(!("hopsLeft" in flags)){
		flags.hopsLeft = flags.maxHops = flags.maxHops || 0;
	}
	
	flags.hopsLeft = isNaN(flags.hopsLeft) ? flags.maxHops : flags.hopsLeft;
	
	out |= (flags.hopsLeft << 2) | flags.maxHops;
	
	return out;
};

INSTEONMessageFlags.prototype.toBitmask = function(){
	return INSTEONMessageFlags.makeBitmask(this);
}
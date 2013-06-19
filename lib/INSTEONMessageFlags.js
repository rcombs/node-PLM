var util = require("./util.js");

var INSTEONMessageFlags = module.exports = function INSTEONMessageFlags(flags){
	if(typeof flags == "number"){
		var arr = util.parseBitmask(flags);
		flags = {
			broadcast: (arr[7] && !(arr[6] || arr[5])) || false,
			group: arr[6] || false,
			ACK: (arr[5]) || false, // NOTE: ACK field is either ACK or NAK!
			NAK: (arr[5] &&  arr[7]) || false,
			extended: arr[4] || false,
			hopsLeft: util.makeBitmask(arr.slice(2, 2)) || 0,
			maxHops: util.makeBitmask(arr.slice(0, 2)) || 0
		}
	}else if(typeof flags != "object"){
//		throw new Error("First parameter to INSTEONMessageFlags must be a Number or an Object!");
		flags = {
			broadcast: false,
			group: false,
			ACK: false,
			NAK: false,
			extended: false,
			maxHops: 0x03,
			hopsLeft: 0x03
		}
	}
	this.broadcast = Boolean(flags.broadcast);
	this.group = Boolean(flags.group);
	this.ACK = Boolean(flags.ACK);
	this.NAK = Boolean(flags.NAK) ;
	this.extended = Boolean(flags.extended);
	this.maxHops = (typeof flags.maxHops == "number" && 0 <= flags.maxHops && 3 >= flags.maxHops) ? flags.maxHops : 3;
	this.hopsLeft = (typeof flags.hopsLeft == "number" && 0 <= flags.hopsLeft && 3 >= flags.hopsLeft) ? flags.hopsLeft : this.maxHops;
}

INSTEONMessageFlags.prototype = new Number;

Object.defineProperties(INSTEONMessageFlags.prototype, {
	valueOf: function valueOf(){
		var flags = this;
		var out = util.makeBitmask([flags.extended, flags.ACK || flags.NAK, flags.group, flags.broadcast || flags.NAK]) << 4;
		
		flags.maxHops = isNaN(flags.maxHops) ? 3 : flags.maxHops;
		
		if(!("hopsLeft" in flags)){
			flags.hopsLeft = flags.maxHops = flags.maxHops || 0;
		}
		
		flags.hopsLeft = (isNaN(flags.hopsLeft) ? flags.maxHops : flags.hopsLeft) & 0x03;
		
		out |= (flags.hopsLeft << 2) | (flags.maxHops & 0x03);
		
		return out;
	},
	inspect: function inspect(){
		return "Flags: " + this.valueOf().toString(2);
	},
	toString: function toString(radix){
		return this.valueOf().toString(radix);
	},
	toPrecision: function toPrecision(precision){
		return this.valueOf().toPrecision(precision);
	},
	toLocaleString: function toLocaleString(locales, options){
		return this.valueOf().toLocaleString(locales, options);
	},
	toFixed: function toFixed(digits){
		return this.valueOf().toFixed(digits);
	},
	toExponential: function toExponential(fractionDigits){
		return this.valueOf().toExponential(fractionDigits);
	}
});

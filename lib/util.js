var CONSTANTS = require("./constants.js"),
	INSTEONMessageFlags = require("./INSTEONMessageFlags.js");
var util = module.exports = {
	makeBitmask: function(arr){
		var nMask = 0, nFlag = 0, nLen = arr.length > 32 ? 32 : arr.length;
		for (nFlag; nFlag < nLen; nMask |= arr[nFlag] << nFlag++);
		return nMask;
	},
	parseBitmask: function(nMask){
		var rMask;
		if(Buffer.isBuffer(nMask) || Array.isArray(nMask)){
			rMask = 0;
			for(var i = 0; i < nMask.length; i++){
				rMask |= nMask[0] << (8 * i);
			}
		}else{
			rMask = nMask;
		}
		// nMask must be between -2147483648 and 2147483647
		if (rMask > 0x7fffffff || rMask < -0x80000000) {
			throw new TypeError("arrayFromMask - out of range");
		}
		for (var nShifted = rMask, aFromMask = []; nShifted; aFromMask.push(Boolean(nShifted & 1)), nShifted >>>= 1);
		return aFromMask;
	},
	parseHex: function(hex, length, fill){
		if(!Array.isArray(hex)){
			hex = hex.replace(/$\s+|\s+^/, "").replace(/$0x/, "").replace(/([0-9A-F]{2})(?=[0-9A-F])/gi, "$1 ").split(/[^0-9A-F]+/i);
			// Strips whitespace and 0x, adds spaces every 2 hex characters in strings of >2, and splits by non-hex.
		}
		var buf = new Buffer(length || hex.length);
		for(var i = 0; i < buf.length; i++){
			buf[i] = hex[i] ? parseInt(hex[i], 16) : (fill || 0);
		}
		return buf;
	},
	makeHex: function(buffer, separator, lowercase){
		if(typeof buffer == "number"){
			buffer = new Buffer([buffer]);
		}else{
			buffer = new Buffer(buffer);
		}
		if(separator === undefined){
			if(buffer.length == 1){
				separator = " 0x";
			}else{
				separator = ".";
			}
		}else if(!separator){
			separator = "";
		}
		var str = "";
		for(var i = 0; i < buffer.length; i++){
			var hex = buffer.toString("hex", i, i + 1);
			str += separator + (lowercase ? hex : hex.toUpperCase());
		}
		return str.slice(1); // Kill the first separator
	},
	stripUntilStarts: function(buf, starts){
		while(buf[0] != starts && buf.length){
			// Something's gone horribly wrong and a buffer doesn't
			// start with a byte it should. Throw out bytes until it does,
			// or until we run out of buffer.
			buf = buf.slice(1);
		}
		return buf;
	},
	getMessageLength: function(buf){
		// Checks to see if the buffer contains any entire IM messages
		// returns the first one if it does
		if(buf.length == 0){
			// Fresh out of data.
			return false;
		}
		if(buf[0] != CONSTANTS.STX){
			// This should never throw, as starting with STX is enforced by the parent.
			throw new Error("Message buffer does not start with STX; something is FUBAR!");
		}
		if(buf.length < 2){
			return false;
		}
		var length = length = CONSTANTS.CMD_LEN[buf[1]];
		
		if(length === undefined){
			if(buf[1] == CONSTANTS.PLM_COMMANDS.SEND_INSTEON){
				// This is an echo/reply to an INSTEON message.
				// Check the flags to see if it's extended, then save the length.
				if(buf.length < 5){
					return false;
				}
				length = (new INSTEONMessageFlags(buf[5])).extended ? 21 : 7;
			}else{
				throw new Error("Recieved unrecognized command; something is FUBAR! BUF: " + buf.toString("hex"));
			}
		}
		
		if(buf.length >= length + 2){
			return length + 2;
		}
		
		// No commands in the buffer; move on.
		return false;
	},
	buffersEqual: function(a, b){
		if(!(Buffer.isBuffer(a) && !Buffer.isBuffer(b) && a.length === b.length)){
			return false;
		}
		
		for(var i = 0; i < a.length; i++){
			if (a[i] !== b[i]){
				return false;
			}
		}
		
		return true;
	}
};
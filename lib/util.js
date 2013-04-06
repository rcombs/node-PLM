var CONSTANTS = require("./constants.js");
var util = module.exports = {
	makeBitmask: function(arr){
		var nMask = 0, nFlag = 0, nLen = arr.length > 32 ? 32 : arr.length;
		for (nFlag; nFlag < nLen; nMask |= arr[nFlag] << nFlag++);
		return nMask;
	},
	parseBitmask: function(nMask){
		// nMask must be between -2147483648 and 2147483647
		if (nMask > 0x7fffffff || nMask < -0x80000000) {
			throw new TypeError("arrayFromMask - out of range");
		}
		for (var nShifted = nMask, aFromMask = []; nShifted; aFromMask.push(Boolean(nShifted & 1)), nShifted >>>= 1);
		return aFromMask;
	},
	makeMessageFlags: function(flags){
		var out = util.makeBitmask([flags.extended, flags.ACK || flags.NAK, flags.group, flags.broadcast || flags.NAK]) << 4;
		
		flags.maxHops = isNaN(flags.maxHops) ? 3 : flags.maxHops;
		
		if(!("hopsLeft" in flags)){
			flags.hopsLeft = flags.maxHops = flags.maxHops || 0;
		}
		
		flags.hopsLeft = isNaN(flags.hopsLeft) ? flags.maxHops : flags.hopsLeft;
		
		out |= (flags.hopsLeft << 2) | flags.maxHops;
		
		return out;
	},
	parseMessageFlags: function(flags){
		var arr = util.parseBitmask(flags);
		return {
			broadcast: (arr[7] && !(arr[6] || arr[5])),
			group: arr[6],
			ACK: (arr[5]), // NOTE: ACK field is either ACK or NAK!
			NAK: (arr[5] &&  arr[7]),
			extended: arr[4],
			hopsLeft: util.makeBitmask(arr.slice(2, 2)),
			maxHops: util.makeBitmask(arr.slice(0, 2))
		};
	},
	makeINSTEONMsg: function(msg){
		var extended = "userData" in msg;
		
		var buf = new Buffer(extended ? 20 : 6);
		
		var flags = (typeof msg.flags == "number") ? msg.flags : util.makeMessageFlags(msg.flags);
		var parsedFlags = (typeof msg.flags == "object") ? msg.flags : util.parseMessageFlags(msg.flags);
		
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
		// We support 2 types of input for commands:
		// 1. Object with `command.number` and `command.data` map to the command 1 and command 2 fields (simple)
		// `command` Array or Buffer containing both (standard)
		if(msg.command.number){
			buf[4] = msg.command.number;
			buf[5] = msg.command.data || 0;
		}else{
			(new Buffer(msg.command)).copy(buf, 4);
		}
		if(extended){
			(new Buffer(msg.userData)).copy(buf, 6);
		}
		
		return buf;
	},
	parseINSTEONMsg: function(buf){
		var flags = util.parseMessageFlags(buf[6]);
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
				length = util.parseMessageFlags(buf[5]).extended ? 21 : 7;
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
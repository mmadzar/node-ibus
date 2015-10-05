var util = require('util');
var Transform = require('stream').Transform;
util.inherits(IbusProtocol, Transform);

var Log = require('log'),
    log = new Log('debug');

function IbusProtocol(options) {
    if (!(this instanceof IbusProtocol))
        return new IbusProtocol(options);

    Transform.call(this, options);
    this._buffer = new Buffer(0);
}


IbusProtocol.prototype._transform = function(chunk, encoding, done) {
    var _self = this;

    _self._buffer = Buffer.concat([_self._buffer, chunk]);

    chunk = _self._buffer;    

    if (chunk.length < 5) {
        // chunk too small, gather more data
    } else {
        log.debug('Analyzing: ', chunk);

        // gather messages from current chunk
        var messages = [];

        var lastFind = -1;

        var mSrc;
        var mLen;
        var mDst;
        var mMsg;
        var mCrc;

        // look for messages in current chunk
        for (var i = 0; i < chunk.length - 5; i++) {

            // BEGIN MESSAGE
            mSrc = chunk[i + 0];
            mLen = chunk[i + 1];
            mDst = chunk[i + 2];

            // test to see if have enough data for a complete message
            if (chunk.length >= (i + 2 + mLen)) {

                mMsg = chunk.slice(i + 3, i + 3 + mLen - 2);
                mCrc = chunk[i + 2 + mLen - 1];

                var crc = 0x00;

                crc = crc ^ mSrc;
                crc = crc ^ mLen;
                crc = crc ^ mDst;

                for (var j = 0; j < mMsg.length; j++) {
                    crc = crc ^ mMsg[j];
                }

                if (crc === mCrc) {
                    messages.push({
                        'id' : Date.now(),
                        'src': mSrc.toString(16),
                        'len': mLen.toString(16),
                        'dst': mDst.toString(16),
                        'msg': mMsg,
                        'crc': mCrc.toString(16)
                    });

                    // mark end of last message
                    lastFind = (i + 1 + mLen);

                    // skip ahead
                    i = (i + 1 + mLen);
                }
            }
            // END MESSAGE
        }

        if (messages.length > 0) {
            messages.forEach(function(message) {
                _self.emit('message', message);
            });
        }

        // Push the remaining data back to the stream
        if (lastFind !== -1) {
            // Push the remaining chunk from the end of the last valid Message
            _self._buffer = _self._buffer.slice(lastFind);
        } else {
            // Push the entire chunk
            if (_self._buffer.length > 2000) {
                // Chunk too big? (overflow protection)
                log.warning('dropping some data..');
                _self._buffer = _self._buffer.slice(500);
            }
        }
    }

    log.debug('Buffered messages size: ', _self._buffer.length);
    done();
};

IbusProtocol.prototype.createIbusMessage = function(msg) {
    // 1 + 1 + 1 + msgLen + 1
    var packetLength = 4 + msg.msg.length;
    var buf = new Buffer(packetLength);

    buf[0] = msg.src;
    buf[1] = msg.msg.length + 2;
    buf[2] = msg.dst;

    for (var i = 0; i < msg.msg.length; i++) {
        buf[3 + i] = msg.msg[i];
    }

    var crc = 0x00;
    for (var i = 0; i < buf.length - 1; i++) {
        crc ^= buf[i];
    }

    buf[3 + msg.msg.length] = crc;

    return buf;
};

module.exports = IbusProtocol;
var https = require('https');
var config = require('./config');
//var JSON = require('JSON');
/*function xirsys () {
    return {
        info: {ident: 'noev', secret: '9bb9eb0e-3f01-11e7-bf11-c9222b51e852', channel: 'channel1'},
        turn: function (req, res, next) {
            //if error
            if (req.error) {
                console.log('error: ', req.error);
                delete req.user;
                next();
            }
            //if error null proxy request to xirsys
            else {
                var options = {
                    method: 'PUT',
                    host: 'global.xirsys.net',
                    path: '/_turn' + '/' + xirsys.info.channel,
                    headers: {
                        "Authorization": "Basic " + new Buffer(xirsys.info.ident + ":" + xirsys.info.secret).toString("base64")
                    }
                };
                //make call to Xirsys API, with modified request. Expect and return response to client.
                https.request(options, function (httpres) {
                    var str = '';
                    httpres.on('data', function (data) {
                        str += data;
                    });
                    //error - returns 500 status and formatted response
                    httpres.on('error', function (e) {
                        console.log('error: ', e);
                        delete req.user;
                        next();
                    });
                    httpres.on('end', function () {
                        var ics = JSON.parse(str);
                        //console.log(ics.v.iceServers);
                        req.user.xirsys = JSON.stringify({iceServers: ics.v.iceServers}, null, null);
                        next();
                    });
                }).end();
            }
        }
    }
}*/
// export the class
var own  = {
    info: {ident: 'noev', secret: '9bb9eb0e-3f01-11e7-bf11-c9222b51e852', channel: 'channel1'},
    turn: function (req, res, next) {
        if (req.error) {
            console.log('error: ', req.error);
            delete req.user;
            next();
        }
        //if error null proxy request to xirsys
        else {
            var options = {
                method: 'PUT',
                host: 'global.xirsys.net',
                path: '/_turn' + '/' + own.info.channel,
                headers: {
                    "Authorization": "Basic " + new Buffer(own.info.ident + ":" + own.info.secret).toString("base64")
                }
            };
            //make call to Xirsys API, with modified request. Expect and return response to client.
            https.request(options, function (httpres) {
                var str = '';
                httpres.on('data', function (data) {
                    str += data;
                });
                //error - returns 500 status and formatted response
                httpres.on('error', function (e) {
                    console.log('error: ', e);
                    delete req.user;
                    next();
                });
                httpres.on('end', function () {
                    var ics = JSON.parse(str);
                    //console.log(ics.v.iceServers);
                    req.user.xirsys = JSON.stringify({iceServers: ics.v.iceServers}, null, null);
                    next();
                });
            }).end();
        }
    }
};

module.exports = own;
(function () {

    if (typeof(user) === 'undefined') {
        return;
    }

    var output = document.getElementById('output'),
        input = document.getElementById('input'),
        avatar = document.getElementById('avatar'),
        presence = document.getElementById('presence'),
        action = document.getElementById('action'),
        send = document.getElementById('send');

    var channel = 'am-ecc-chat';

    var keysCache = {};

    var pubnub = new PubNub({
        subscribeKey: 'sub-c-981faf3a-2421-11e5-8326-0619f8945a4f',
        publishKey: 'pub-c-351c975f-ab81-4294-b630-0aa7ec290c58',
        uuid: user.username,
        authKey: user.accessToken,
        ssl: true
    });
    var users = [];

    var own = this;

    var localVideoEl = document.getElementById('local-video');
    var remoteVideoEl = document.getElementById('remote-video');
    var localStream;//local audio and video stream
    var mediaConstraints = {
        audio: true,
        video: {
            "min": {"width": "800", "height": "600"},
            "max": {"width": "1024", "height": "768"}
        }
    };

    pubnub.addListener({
        status: function (statusEvent) {
            if (statusEvent.category === "PNConnectedCategory") {
                getHistory();
                pubnub.setState({state: {inCall: false}, channels: [channel]},
                    function (status, response) {
                        //console.log(status, response);
                });
            }
        },
        message: function (messageEvent) {
            //console.log("New Message!!", messageEvent.message);
            if (messageEvent.message == null) {
                return
            }

            var type = messageEvent.message.type;
            switch (type) {
                case 'text':
                    displayOutput(messageEvent.message);
                    break;
                case 'candidate':
                    if (messageEvent.message.peerID == user.username) {
                        var iceCandidate = messageEvent.message[type];
                        var rtcIceCandidate = new RTCIceCandidate(iceCandidate);
                        own.pc.addIceCandidate(rtcIceCandidate);
                    }
                    break;
                case 'offer':
                    if (messageEvent.message.peerID == user.username) {
                        var desc = messageEvent.message[type];
                        own.remotePeerID = messageEvent.message.responseID;
                        if (!own.pc) {
                            if (createPeerConnection()) {
                                //
                            }
                        }
                        own.pc.setRemoteDescription(new RTCSessionDescription(desc),
                            function () {
                                console.log('sucRTCSessionDescription');
                                own.pc.createAnswer(function (desc) {
                                        own.pc.setLocalDescription(desc, function () {
                                                var message = {answer: desc, peerID: own.remotePeerID, type: 'answer'};
                                                message['signature'] = ecc.sign(user.eccKey, JSON.stringify(message));

                                                var publishConfig = {
                                                    channel: channel,
                                                    message: message
                                                };
                                                pubnub.publish(publishConfig, function (status, response) {
                                                    console.log(status, response);
                                                });
                                            },
                                            function (err) {
                                                console.log('errsetLocalDescription ', err);
                                            });
                                    }, // success
                                    function (err) {
                                        own.onCreateSessionDescriptionError(err);
                                    } // error
                                );
                            },
                            function (err) {
                                console.log('errRTCSessionDescription ', err)
                            });
                    }
                    break;
                case 'answer':
                    var answer = messageEvent.message[type];
                    if (messageEvent.message.peerID == user.username) {
                        own.pc.setRemoteDescription(new RTCSessionDescription(answer),
                            function () {
                                console.log('sucRTCSessionDescription')
                            },
                            function (err) {
                                console.log('errRTCSessionDescription ', err)
                            });
                    }
                    break;
            }

        },
        presence: function (presenceEvent) {
            // handle presence

            console.log('presenceEvent: ', presenceEvent);
            if ((presenceEvent.action === 'join' || presenceEvent.action === 'state-change') && (presenceEvent.uuid != user.username)) {
                if (users.indexOf(presenceEvent.uuid) == -1) {
                    users.push(presenceEvent.uuid);
                }
                if (presenceEvent.state) {
                    if (presenceEvent.state.inCall == false) {
                        call(presenceEvent.uuid);
                        //console.log('calling new client: ', presenceEvent.uuid);
                    }
                }
                /**/

            } else if (((presenceEvent.action === 'timeout') || (presenceEvent.action === 'leave')) && presenceEvent.uuid != user.username) {
                users.splice(users.indexOf(presenceEvent.uuid), 1);
            }


            if (presenceEvent.occupancy === 1) {
                presence.textContent = presenceEvent.occupancy + ' person online';
            } else {
                presence.textContent = presenceEvent.occupancy + ' people online';
            }
            if ((presenceEvent.action === 'join') || (presenceEvent.action === 'timeout') || (presenceEvent.action === 'leave')) {
                var status = (presenceEvent.action === 'join') ? 'joined' : 'left';
                action.textContent = presenceEvent.uuid + ' ' + status + ' room';
                action.classList.add(presenceEvent.action);
                action.classList.add('poof');
                action.addEventListener('animationend', function () {
                    action.className = '';
                }, false);
            }
        }
    });
    
    function getMyMedia() {
        return navigator.mediaDevices.getUserMedia(mediaConstraints).catch(function (err) {
            console.log('Could not get Media: ', err);
            alert('Could not get Media!! Check your Camera.');
            throw err;
        });

    }

    function setLocalStream(str) {
        localStream = str;
        localVideoEl.srcObject = localStream;
    }

    function createPeerConnection() {
        try {
            own.pc = new RTCPeerConnection(JSON.parse(user.xirsys).iceServers);

            own.pc.onnegotiationneeded = function () {
                own.pc.createOffer(function (desc) {
                        console.log('createOffer-desc  ', desc);
                        own.pc.setLocalDescription(desc)
                            .then(function () {
                                var message = {
                                    offer: desc,
                                    peerID: own.remotePeerID,
                                    type: 'offer',
                                    responseID: user.username
                                };
                                message['signature'] = ecc.sign(user.eccKey, JSON.stringify(message));

                                var publishConfig = {
                                    channel: channel,
                                    message: message
                                };
                                pubnub.publish(publishConfig, function (status, response) {
                                    console.log(status, response);
                                });
                            })
                            .catch(function (err) {
                                console.log('errsetLocalDescription ', err);
                            });
                    },
                    // create offer err
                    function (err) {
                        console.log('Failed to create session description: ', error);
                    });

            }; // negotiation

            own.pc.onicecandidate = function (evt) {
                //send to peer
                var candidate = evt.candidate;
                console.log('candidate ', evt);
                if (!!candidate) {
                    var message = {candidate: candidate, peerID: own.remotePeerID, type: 'candidate'};
                    message['signature'] = ecc.sign(user.eccKey, JSON.stringify(message));

                    var publishConfig = {
                        channel: channel,
                        message: message
                    };
                    pubnub.publish(publishConfig, function (status, response) {
                        //console.log(status, response);
                    });
                }
            };
            own.pc.ontrack = function (evt) {
               remoteVideoEl.srcObject = evt.streams[0];
            };
            own.pc.onremovestream = function (evt) {
                console.log('*p2p*  onremovestream ', evt);
            };

            getMyMedia().then(function (stream) {
                setLocalStream(stream);
                stream.getTracks().forEach(function (track) {
                    own.pc.addTrack(track, stream);
                });
            });

            return true;
        } catch (e) {
            console.log('Failed to create PeerConnection, exception: ' + e.message);
            return false;
        }
    }

    function call(id) {
        console.log('call ', id, '  -- ', user.username);
        if (createPeerConnection()) {
            own.remotePeerID = id;
        }
    }

    function displayOutput(message) {
        //console.log(message);
        if (!message) return;
        if (typeof(message.text) === 'undefined') return;

        var html = '';

        if ('userid' in message && message.userid in keysCache) {

            var signature = message.signature;

            delete message.signature;

            var result = ecc.verify(keysCache[message.userid].publicKey, signature, JSON.stringify(message));

            if (result) {
                html = '<p><img src="' + keysCache[message.userid].avatar + '" class="avatar"><strong>' + keysCache[message.userid].username + '</strong><br><span>' + message.text + '</span></p>';
            } else {
                html = '<p><img src="images/troll.png" class="avatar"><strong></strong><br><em>A troll tried to spoof ' + keysCache[message.userid].username + ' (but failed).</em></p>';
            }

            output.innerHTML = html + output.innerHTML;

        } else {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', '/user/' + message.userid, true);
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    var res = JSON.parse(xhr.responseText);

                    keysCache[message.userid] = {
                        'publicKey': res.publicKey,
                        'username': res.username,
                        'displayName': res.displayName,
                        'avatar': res.avatar_url,
                        'id': res.id
                    }
                    displayOutput(message);
                }
            };
            xhr.send(null);
        }
    }

    function getHistory() {
        pubnub.history({
            channel: channel,
            count: 30
        }, function (status, response) {
            if (status.error && response != null) {
                //no history available
            } else {
                response.messages.forEach(function (m) {
                    if (m.entry.type == 'text')displayOutput(m.entry);
                });
            }
        });
    }

    function post() {
        var safeText = input.value.replace(/\&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var message = {text: safeText, userid: user.id, type: 'text'};

        var signature = ecc.sign(user.eccKey, JSON.stringify(message));
        message['signature'] = signature;

        pubnub.publish({
            channel: channel,
            message: message
        });

        input.value = '';
    }

    input.addEventListener('keyup', function (e) {
        if (input.value === '') return;
        (e.keyCode || e.charCode) === 13 && post();
    }, false);

    send.addEventListener('click', function (e) {
        if (input.value === '') return;
        post();
    }, false);


    pubnub.subscribe({
        channels: [channel],
        withPresence: true,
        restore: true
    });
})();
const express = require('express');
const bodyP = require('body-parser');
var nunjucks = require('nunjucks');
const http = require('http');
const socketIO = require('socket.io');
var firebase = require('firebase');
var firebaseConfig = require('./js/firebase.js');
const { userObj } = require('./js/userObj');
const { Users } = require('./js/Users');

// INITIALIZE THE APP
const app = express();
app.use(bodyP.json());
app.use(bodyP.urlencoded({ extended: true }));

// ADD STATIC FOLDERS AND FILES USED IN THE PROGRAM
app.use(express.static("views"));
app.use(express.static("views/Home"));
app.use(express.static("views/Login"));
app.use(express.static("views/Register"));
app.use(express.static("views/Main"));
app.use(express.static("views/Play"));

// ENGINE USE TO RENDER
nunjucks.configure('views', {
    express: app,
    autoescape: true
});
app.set('view engine', 'html');


// INITIALISE FIREBASE
firebase.initializeApp(firebaseConfig.getFirebaseConfig());
var db = firebase.firestore();

// SOCKET IO NEED OUR OWN HTTP SERVER
const port = 3000;
let server = http.createServer(app);
let io = socketIO(server);

/********* ***********/
/****** ROUTES *******/
/********* ***********/
app.get('/', function(req, res){
    res.sendFile('home.html', { root: __dirname + "/views/Home" } );
});


/****** PAGE REGISTER *******/
app.get('/register', function(req, res) {
    res.render('Register/register');
});

app.post('/register', async function(req, res) {
    var firstTimeCall = true;

    var username = req.body.username;
    var email = req.body.email;
    var password = req.body.password;
    var repassword = req.body.re_password;

    // DISCONNECT POSSIBLY CONNECTED USER
    if(firebase.auth().currentUser) firebase.auth().signOut();

    if(password == repassword)
    {
        // ACCOUNT CREATION ON FIREBASE AUTHENTIFICATION
        firebase.auth().createUserWithEmailAndPassword(email,password).catch(function(error)
        {
            var errorCode = error.code;
            var errorMessage = error.message;
            console.log(errorCode + ":" + errorMessage);

            res.render('Register/register', {error_message: errorMessage,
                username: req.body.username,
                email: req.body.email,
                password: req.body.password,
                re_password: req.body.re_password
            });
        });
        // ADD USER TO DB
        firebase.auth().onAuthStateChanged(function(user)
        {
            if(user){
                if(firstTimeCall){
                    firstTimeCall = false;
                    // ADD USERNAME INFO TO AUTH SYSTEM
                    user.updateProfile({
                        displayName: username
                    }).then(function() {
                        // USER DATA TO INSERT IN DB
                        let data = {
                            userUID : user.uid,
                            username : username,
                            email: email,
                            win: 0,
                            lost: 0
                        };
                        // ADD USER TO THE DB
                        db.collection("users").doc(username).set(data)
                            .then(function() {
                                res.redirect("/main");
                                console.log("User " + username + " added to DB");
                                return(1);
                            })
                            // IF USER CAN'T BE ADDED TO DB, REMOVING ACCOUNT FROM FIREBASE AUTHENTICATION
                            .catch(function(error) {
                                console.error("Error adding user: ", error);
                                user.delete()
                                    .then(function() {console.error("USER ACCOUNT DELETED");})
                                    .catch(function(error) { console.error("Error deleting user account: ", error);});
                            });
                    })
                        .catch(function(error)
                        {
                            var errorCode = error.code;
                            var errorMessage = error.message;
                            console.log(errorCode + ":" + errorMessage);

                            res.render('Register/register', {error_message: errorMessage,
                                username: username,
                                email: email,
                                password: password,
                                re_password: repassword
                            });
                        });
                }
            }
        });
    }
    else        // IF PASSWORD AND PASSWORD CONFIRMATION ARE NOT ==
    {
        res.render('Register/register', {error_message: 'Passwords do not match !',
            username: req.body.username,
            email: req.body.email,
            password: req.body.password,
            re_password: req.body.re_password
        });
    }
});

/****** LOGIN *******/
app.get('/login', function(req, res) {
    res.render('Login/login');
});

app.post('/login', async function(req, res) {
    var firstStateChange = true;
    try {
        var email = req.body.email;
        var password = req.body.password;
        // USER CONNEXION
        firebase.auth().signInWithEmailAndPassword(email, password).then(function(firebaseUser) {
            firebase.auth().onAuthStateChanged(function(user) {
                if (user && firstStateChange) {
                    firstStateChange = false;
                    return res.redirect("/main");
                }
            });
        })
        // IF USER CONNEXION FAIL
            .catch(function(error) {
                var errorCode = error.code;
                var errorMessage = error.message;
                console.log(errorCode + ":" + errorMessage);

                res.render('Login/login', {error_message: errorMessage,
                    email: req.body.email,
                    password: req.body.password});
            });
    }
    catch(error) {
        console.error("Login error:" + error);
    }
});

/****** FORGET PASSWORD *******/
app.get('/forgetPassword', function(req, res) {
    var user = firebase.auth().currentUser;
    if(!user){
        res.render('Login/forgetPassword');
    }
    else{
        res.redirect("/main");
    }
});

app.post('/forgetPassword', async function(req, res) {
    try {
        var auth = firebase.auth();
        var email = req.body.email;

        auth.sendPasswordResetEmail(email).then(function()
        {
            res.render('Login/forgetPassword', {result_message: "The instructions to reset your password has been sent to you"});
        })
            .catch(function(error)
            {
                var errorCode = error.code;
                var errorMessage = error.message;

                console.log(errorCode + ":" + errorMessage);
                res.render('Login/forgetPassword', {result_message: errorMessage});
            });
    }
    catch(error) {
        console.error("Reset password error:" + error);
    }
});

/****** MAIN *******/
app.get('/main', function(req, res) {
    var user = firebase.auth().currentUser;
    if(!user){
        res.redirect('/login');
    }
    else{
        res.render('Main/main', {  user: user });
    }
});

/****** PLAY *******/
app.get('/play', function(req, res) {
    var user = firebase.auth().currentUser;
    if(!user){
        res.redirect('/login');
    }
    else{
        res.sendFile('Play/play.html', { root: __dirname + "/views" } );
    }
});

/****** DISCONNECT *******/
app.get('/disconnect', function(req, res) {
    if(firebase.auth().currentUser){
        firebase.auth().signOut();
    }
    res.redirect('/');
});

/********* ***********/
/****** SOCKET *******/
/********* ***********/

let users = new Users();
let inBattle = [];
let opponent = false;

var dbUsers = new Map();
// the server listen for a connection
io.on('connection', (socket) => {

    user = firebase.auth().currentUser;

    if (user) {

        let userobj = new userObj(socket.id, user.uid, user.displayName);

        // if user in inbattle list update their socket id with new one
        if (inBattle.length != 0) {
            if (!opponent) {
                let challenger = inBattle.shift();
                users.getUserById(challenger.idUser).idSocket = socket.id;
                opponent = true;
            }
            else {
                let challenged = inBattle.shift();
                users.getUserById(challenged.idUser).idSocket = socket.id;
                opponent = false;
                inBattle = [];
            }
        }

        // RECUPERATION DONNES UTILISATEUR EN BD
        db.collection("users").get()
            .then(function(querySnapshot) {
                console.log('updateUserConnected recup BD');
                //console.log(users);
                if (!querySnapshot.empty) {
                    querySnapshot.docs.map(function (documentSnapshot) {
                        dbUsers.set(documentSnapshot.data().username, [documentSnapshot.data().username, documentSnapshot.data().lost, documentSnapshot.data().win]);
                    });
                } else console.log('NO USER FOUND IN DATABASE !');


        // if not already in the list add him & send the update list
        if (!users.getUserById(userobj.idUser)) {
            users.addUser(userobj);
            io.emit('updateUserConnected', users.getUsers(), Array.from(dbUsers));
        }

        // if return from battle need to remplace socket
        if (users.usersWithoutSocket.length !== 0) {
            userobj = users.updateIdAfterBattle(socket.id);
            io.emit('updateUserConnected', users.getUsers(), Array.from(dbUsers));
        }

        // Remove the user from the list and send it to the front
        socket.on('NewLogout', (message) => {
            users.removeUser(socket.id);
            io.emit('updateUserConnected', users.getUsers(), Array.from(dbUsers));
        });

        // Remove the user from the list and send it to the front
        socket.on('disconnect', () => {
            // if user exist not in battle remove him
            if (users.getUserBySocket(socket.id)) {
                if ((users.getUserBySocket(socket.id)).available == true) {
                    users.removeUser(socket.id);
                    io.emit('updateUserConnected', users.getUsers(), Array.from(dbUsers));

                  }
              }
          });

        // end the game end return to main.html
        socket.on('GiveUpRequest', (me, opponent) => {

          // Add them to the inBattle array and send give up to opponent
          inBattle.push(users.getUserBySocket(socket.id));
          inBattle.push(users.getUserBySocket(opponent.idSocket));

          socket.broadcast.to(opponent.idSocket).emit('GiveUpRequest', opponent.SocketId);

          // Remettre le available a true pour les 2 & envoyer la mise a jour
          users.endBattle(socket.id, opponent.idSocket);
          setTimeout( () => {io.emit('updateUserConnected', users.getUsers(), Array.from(dbUsers));}, 3000);

          // Incrementation
          const increment = firebase.firestore.FieldValue.increment(1);
          db.collection("users").doc(opponent.username).update({
              win: increment
          }).catch(function(error) {
                  console.error("Error incrementing victory of user " +  opponent.username + ": ", error.message);
              });
          db.collection("users").doc(me.username).update({
                lost: increment
            }).catch(function(error) { console.error("Error incrementing lost of user " +  me.username + ": ", error.message);
            });
        });

        socket.on('EndGame', (res) => {
          // Add them to the inBattle array and send give up to opponent
          inBattle.push(users.getUserBySocket(res.winner.idSocket));
          inBattle.push(users.getUserBySocket(res.looser.idSocket));
          io.to(res.looser.idSocket).emit('EndGame',res);
          io.to(res.winner.idSocket).emit('EndGame',res);

          // Remettre le available a true pour les 2 & envoyer la mise a jour
          users.endBattle(res.winner.idSocket, res.looser.idSocket);
          setTimeout( () => {io.emit('updateUserConnected', users.getUsers(), Array.from(dbUsers));}, 3000);

          // Incrementation
          const increment = firebase.firestore.FieldValue.increment(1);
          db.collection("users").doc(res.winner.username).update({
              win: increment
          }).catch(function(error) {
                  console.error("Error incrementing victory of user " +  res.winner.username + ": ", error.message);
              });
          db.collection("users").doc(res.looser.username).update({
                lost: increment
            }).catch(function(error) { console.error("Error incrementing lost of user " +  res.looser.username + ": ", error.message);
            });
        });

        // When battle button clicked send both to play.html
        socket.on('battle', (res) => {

          // recover both opponent
          let challenger = users.getUserBySocket(res.challengerSocketId);
          let challenged = users.getUserBySocket(res.challengedSocketId);

          // Verif available & send both in play.html
          if (challenger.invite(challenged) == true) {

            // challenger take black
            challenger.color = "black";

            // challenged take white
            challenged.color = "white";
            challenged.turn = true;

            // Add them in list inBattle
            inBattle.push(challenger);
            inBattle.push(challenged);

            // Send both in play & update list
            io.to(challenger.idSocket).emit('battlePage');
            io.to(challenged.idSocket).emit('battlePage');

            // Wait until they are on play.html
            setTimeout( () => {
              io.to(challenger.idSocket).emit('UpdateBattle', {
                challenger: challenger,
                challenged: challenged,
                users: users.getUsers()

              });
              io.to(challenged.idSocket).emit('UpdateBattle', {
                challenger: challenger,
                challenged: challenged,
                users: users.getUsers()
              });
              io.emit('updateUserConnected', users.getUsers(), Array.from(dbUsers));
            }, 4000);
          }
        });
      });


        // Pass my turn & opponent turn
        socket.on('PassTurn', (res) => {
            res.me.turn = false;
            res.opponent.turn = true;
            socket.emit('UpdateBattle', {challenger: res.me, challenged: res.opponent});
            socket.broadcast.to(res.opponent.idSocket).emit('UpdateBattle', {challenger: res.me, challenged: res.opponent});
        });

        // update the adversaire board
        socket.on('UpdateBoardMvt', (res) => {
            socket.broadcast.to(res.opponent.idSocket).emit('UpdateBoardMvt', res);
        });

        //update opponent board delete
        socket.on('UpdapteBoardDelete', (res) => {
            socket.broadcast.to(res.opponentSocket).emit('UpdapteBoardDelete',res);
            console.log(res.opponentSocket);
        });
    }
});

// HAVE REPLACE app by server
server.listen(port, () => console.log(`Example app listening on port ${port}!`));

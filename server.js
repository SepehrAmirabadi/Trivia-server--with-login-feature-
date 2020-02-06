//middle ware declerations
const mongoose = require("mongoose");
const express = require('express');
const Question = require("./QuestionModel"); 
let mongo = require('mongodb');

const session = require('express-session')
const MongoDBStore = require('connect-mongodb-session')(session);

const user = new MongoDBStore({
  uri: 'mongodb://localhost:27017/tokens',
  collection: 'sessions'
});

const app = express();

// using middleware
app.use(session({ secret: 'some secret here', user: user }))
app.use(express.urlencoded({extended: true}));
app.set("view engine", "pug");
app.use(express.static("public"));
app.use(express.json());

// renders the index page
app.get('/', function(req, res, next) {
	
	// if the user is logged in it renders the appropriate array using the pug template
	if (req.session.loggedin) {
		res.render("pages/index", {log: true, name: req.session.username, id: req.session.locator});
	}
	else {
		res.render("pages/index", {log: false});
	}
	return;
});

// handles get and post routes
app.get("/users", getUsers); 
app.get("/users/:UID", getUser); 
app.post("/privacy", setprivacy);

//Returns a page with a new quiz of 10 random questions
//loads the appopriate header
app.get("/quiz", function(req, res, next){
	Question.getRandomQuestions(function(err, results){
		if(err) throw err;
		if (req.session.loggedin) {
			res.status(200).render("pages/quiz", {questions: results,log: true, name: req.session.username, id: req.session.locator});
		}
		else {
			res.status(200).render("pages/quiz", {questions: results, log: false});
		}
		return;
	});
})

//The quiz page posts the results here
//Extracts the JSON containing quiz IDs/answers
//Calculates the correct answers and replies
app.post("/quiz", function(req, res, next){
	let ids = [];
	try{
		//Try to build an array of ObjectIds
		for(id in req.body){
			ids.push(new mongoose.Types.ObjectId(id));
		}
		
		//Find all questions with Ids in the array
		Question.findIDArray(ids, function(err, results){
			if(err)throw err; //will be caught by catch below
			
			//Count up the correct answers
			let correct = 0;
			for(let i = 0; i < results.length; i++){
				if(req.body[results[i]._id] === results[i].correct_answer){
					correct++;
				}
			}
			
			// IF the user is logged in it updates the database
			if (req.session.loggedin) {
				 mongoose.connection.db.collection("users").updateOne({"_id": mongo.ObjectId(req.session.locator)}, {"$inc": {"total_quizzes" : 1, "total_score": correct}}, function(err,result){
					if(err) throw err;
					res.json({url: "/users/"+req.session.locator, correct: correct});
				});
				return; 
			}
			
			//Send response
			res.json({url: "/", correct: correct});
			return;
		});
	}catch(err){
		//If any error is thrown (casting Ids or reading database), send 500 status
		console.log(err);
		res.status(500).send("Error processing quiz data.");
		return;
	}
	
});


// gets a list of users that are not private and renders a list of links using a pug template
function getUsers (req,res,next) {
	let userlist =[]
	db.collection("users").find().toArray(function (err, results) {
		if (err) throw err;
		
		results.forEach(user=>{
			
			//checks for privacy
			if(user.privacy == false || user.privacy == "Off") {
				userlist.push(user);
			}
		})
		
		//loads the appropriate html template
		if (req.session.loggedin) {
			res.render("pages/users", {Users:userlist, log: true, name: req.session.username, id: req.session.locator}); 
		}
		else {
			res.render("pages/users", {Users:userlist, log: false}); 
		}
	}); 
}



//renders a users profile page
function getUser (req,res,next) {
	//extracts user id from url
	let oid;
	try{
		oid = new mongo.ObjectID(req.params.UID);
	}catch{
		res.status(404).send("Status 404: Unknown ID");
		return;
	}
	
	// if  the user is logged in a the pug template is loaded differently
 	if (req.session.loggedin) {
		
		//searches for a user with the given id
		mongoose.connection.db.collection("users").findOne({"_id" : oid}, function (err,result) {
			
			// if the session var locator is the same as oid then in it the users own profile
			//thus we load the logout  and privacy functionality
			if (req.session.locator == oid) {
				console.log("this is my profile");
				res.render("pages/user", {User: result, ownprofile: true, priv: result.privacy,log: true, name: req.session.username, id: req.session.locator}); 
			}
			else {
				//checks for privacy
				if (result.privacy == false || result.privacy == "Off") {
					res.render("pages/user", {User: result, ownprofile: false,log: true, name: req.session.username, id: req.session.locator}); 
				}
				else {
					res.status(403).send("status 404: this profile cannot be acsessed"); 
				}
			}
		})
	}
	else {
		// if the user is not logged in we simply check to see if we can find a matching user that is not private
		mongoose.connection.db.collection("users").findOne ( {"_id" : oid},function (err,result) {
			
			if (result.privacy == false || result.privacy == "Off") {
				res.render("pages/user", {User: result, log: false}); 
			}
			else {
				res.status(403).send("status 403: this profile cannot be acsessed"); 
			}
			
		})
		
	} 
}

// sets the privacy of the user updates the database
function setprivacy(req,res,next) {
	let priv = (req.body.privacy); 
	if (req.session.loggedin) {
		
		//updating privacy object
 		mongoose.connection.db.collection("users").updateOne({"_id": mongo.ObjectId(req.session.locator)}, {"$set": {"privacy" : priv}}, function(err,result){
			if(err) throw err;
			
			res.status(200); 
			//console.log(result);
		});
	}
}

//handle logins for the user
app.post("/login", function(req, res, next){
	
	//if already logged in go to the main page
	if(req.session.loggedin){
		res.redirect("/");
		return;
	}
	
	let queryObj = {}; 
	
	let username = req.body.username;
	let pass = req.body.password;
	
	queryObj.username = username;	
	queryObj.password = pass;
	console.log(queryObj);
	
	// finds a user with a username and password matching that in the database
	mongoose.connection.db.collection("users").findOne(queryObj, function(err, result){
		if(err)throw err;
		
		console.log(result);
		
		// if the user exists we create a session
		// otherwise we redirect them to the main page
		if(result){
			//We don't check passwords at all
			//Probably not a great idea in general
			req.session.loggedin = true;
			req.session.username = username;
			req.session.locator = result["_id"]; 
			console.log("Username: " + username);
			console.log(result);
			res.redirect("/users/" + result["_id"]);
		}else{
			res.redirect("/"); 
			return;
		}
	})
	
})

//logs out the user
app.get("/logout", function(req, res, next){
	req.session.loggedin = false;
	res.redirect("/");
})


//Connect to database
mongoose.connect('mongodb://localhost/quiztracker', {useNewUrlParser: true});
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
	app.listen(3000);
	console.log("Server listening on port 3000");
});
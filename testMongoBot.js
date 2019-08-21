const MongoClient = require('mongodb').MongoClient;
const uri = require('./mongoConnection.json');
const mongoClient = new MongoClient(uri.connectionString, { useNewUrlParser: true });
mongoClient.connect(async(err, db) => {
    var dbo = db.db("StevesBotDb").collection("Challenges");
    await dbo.insertOne({ "startedBy" : "Test", "challenged" : "Bob" });    
    
    var challengersByUserName = await dbo.findOne({ "challenged" : "Bob" });
    await dbo.deleteOne({ "_id" : challengersByUserName._id});

});

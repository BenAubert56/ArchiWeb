db = db.getSiblingDB("google-like");

db.createUser({
  user: "pdfuser",
  pwd: "pdfpassword",
  roles: [
    { role: "readWrite", db: "google-like" }
  ]
});

db.createCollection("documents");
db.createCollection("users");
db.createCollection("SearchLog");
db.createCollection("AuthLog");
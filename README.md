[osqlite](https://github.com/131/osqlite) gives you an [sqlite3](https://github.com/mapbox/node-sqlite3) database on an object storage backed (like [openstack swift](https://github.com/131/swift))


[![Build Status](https://travis-ci.org/131/osqlite.svg?branch=master)](https://travis-ci.org/131/osqlite)
[![Coverage Status](https://coveralls.io/repos/github/131/osqlite/badge.svg?branch=master)](https://coveralls.io/github/131/osqlite?branch=master)
[![Version](https://img.shields.io/npm/v/osqlite.svg)](https://www.npmjs.com/package/osqlite)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)
[![Code style](https://img.shields.io/badge/code%2fstyle-ivs-green.svg)](https://www.npmjs.com/package/eslint-plugin-ivs)
![Available platform](https://img.shields.io/badge/platform-win32-blue.svg)



# Motivation
Object storage is, by far, the cheapest cloud storage solution. If i want to store TB of contents, a [CAS designed](https://en.wikipedia.org/wiki/Content-addressable_storage) container is an excellent choice. But CAS relies on external database to handle file properties (name, directories & properties). [osqlite](https://github.com/131/osqlite) allows you to store your database in the very same object storage container your CAS relies on.

[osqlite](https://github.com/131/osqlite) uses the SQLite3 "hot" [backup/replication API](https://sqlite.org/backup.html) to publish current database and register triggers on the [SQLite3 update hook API](https://www.sqlite.org/c3ref/update_hook.html) to know "when" to sync.

# Usage example

```
const OSQLite = require('osqlite');

const creds   = require('./credentials');
const Context = require('swift/context');

var ctx = await Context.build(creds);
var lnk = new OSQLite({
  backend   : {type : 'swift', ctx},
  container : 'container',
  filename  : 'index.sqlite',
});

await lnk.query("CREATE TABLE  IF NOT EXISTS lorem (info TEXT)");

console.log("Database contains %d entries", await lnk.value("SELECT COUNT(*) FROM lorem"));

for(let var i=0;i<10;i++) {
  let message = "foobar" + Date.now();
  console.log("Updating sqlite database");
  await lnk.insert("lorem", {"info": message});
  await sleep(200);
}


await lnk.close();//flush all to remote endpoint

```

# Efficiency, triggers & throttle
[osqlite](https://github.com/131/osqlite)  will trigger synchronisation (object storage write) after each update/delete/insert following [a cargo pattern](https://camo.githubusercontent.com/f4810e00e1c5f5f8addbe3e9f49064fd5d102699/68747470733a2f2f662e636c6f75642e6769746875622e636f6d2f6173736574732f313637363837312f36383130312f38346339323036362d356632392d313165322d383134662d3964336430323431336266642e676966).






# Credits 
* [131](https://github.com/131)

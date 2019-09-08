"use strict";

const expect = require('expect.js');
const guid   = require('mout/random/guid');

const Context = require('swift/context');
const Storage = require('swift/storage');

const container = "trashme_tests_ci";
const filename = 'index.sqlite';
const secret = guid();
const OSQLite = require('../');
const SQL = OSQLite.SQL;

const sleep = require('nyks/async/sleep');

var creds;
if(process.env['OS_USERNAME']) {
  creds = {
    "username" : process.env['OS_USERNAME'],
    "password" : process.env['OS_PASSWORD'],
    "tenantId" : process.env['OS_TENANT_ID'],
    "region"   : process.env['OS_REGION_NAME'],
  };
} else {
  creds = require('./credentials.json');
}


describe("Sync stack test suite", function() {
  this.timeout(60 * 1000);

  var ctx, lnk;

  before("should check for proper credentials", async () => {
    ctx = await Context.build(creds);
  });

  it("should create a dedicated container", async () => {
    var res = await Storage.createContainer(ctx, container);
    expect(res).to.be.ok();
    await Storage.tempKey(ctx, container, secret);
  });


  it("Should delete a existing file", async () => {
    try {
      var res = await Storage.deleteFile(ctx, container, filename);
      expect(res).to.be.ok();
    } catch(err) {}
  });

  //create new lnk and lines from remote database
  //reading remote database never induce WRITE operations

  let lnk2;

  let countRemote = async function() {
    return await lnk2.value(SQL`SELECT COUNT(*) FROM lorem`);
  };


  it("should prepare all things", async () => {
    lnk = OSQLite.build({
      backend   : {type : 'swift', ctx},
      container, filename
    });

    await lnk.query(SQL`CREATE TABLE  IF NOT EXISTS lorem (info TEXT)`);
    expect(await lnk.value(SQL`SELECT COUNT(*) FROM lorem`)).to.eql(0);
    await sleep(2000);

    await lnk.insert("lorem", {"info" : "first"});

    await sleep(3 * 1000); //cargo is gone

    lnk2 = OSQLite.build({
      backend   : {type : 'swift', ctx},
      container, filename
    });

    expect(await countRemote()).to.eql(1);
  });

  it("should now contains 1 entry", async () => {
    await lnk.insert("lorem", {"info" : "first"});
    //wait for remote to sync
    await new Promise(resolve => lnk2.once("remote_update", resolve));
    expect(await countRemote()).to.eql(2);

    await lnk.insert("lorem", {"info" : "foobar" + Date.now()});
    //cargo is gone
    await lnk.insert("lorem", {"info" : "foobar" + Date.now()});
    await lnk.insert("lorem", {"info" : "foobar" + Date.now()});
    await lnk.insert("lorem", {"info" : "foobar" + Date.now()});
    await lnk.insert("lorem", {"info" : "foobar" + Date.now()});

    await sleep(30 * 1000);
    expect(await countRemote()).to.be(7);
  });

  it("should destroy remote", async () => {
    await lnk.close();//flush all to remote endpoint
    await lnk.destroy();
  });

});

// Automatic update regression: the former manual action must not return.
const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
for(const file of ['index.html','app.js','core/updates/pwa-update.js']) assert.doesNotMatch(readFileSync(path.join(__dirname,'..',file),'utf8'),/checkAppUpdates/);
const out=process.env.CASUR_QA_OUT;if(!out)throw Error('CASUR_QA_OUT required');
const run=spawnSync(process.execPath,[path.join(__dirname,'qa-hotfix-update.cjs'),out],{stdio:'inherit',env:process.env});
if(run.error)throw run.error;process.exitCode=run.status??1;

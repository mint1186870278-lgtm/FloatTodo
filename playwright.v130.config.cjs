const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/v130',workers:1,timeout:120000,expect:{timeout:12000},reporter:[['list'],['json',{outputFile:`artifacts/v130/${process.env.FLOATTODO_PORTABLE_TEST?'portable':process.env.FLOATTODO_V130_EXE?'packaged':'source'}-results.json`}]],outputDir:'artifacts/v130/test-output'});

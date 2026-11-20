const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/v131',workers:1,timeout:120000,expect:{timeout:12000},reporter:[['list'],['json',{outputFile:'artifacts/v131/gui-results.json'}]],outputDir:'artifacts/v131/test-output'});

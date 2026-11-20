const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/e2e',grepInvert:/actual Chrome foreground/,workers:1,timeout:45000,expect:{timeout:8000},reporter:[['list'],['json',{outputFile:'artifacts/interaction-validation/e2e-results.json'}]],outputDir:'artifacts/interaction-validation/e2e-output'});

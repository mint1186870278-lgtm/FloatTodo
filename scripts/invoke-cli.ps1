param([string]$ProjectPath,[ValidateSet('add','list','complete','move','status')][string]$Verb,[string]$Title,[string]$Category,[string]$Id,[string]$CommandId,[int]$Wait=0)
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$cliArgs=@()
if($Title){$cliArgs+=@('--title',$Title)}
if($Category){$cliArgs+=@('--category',$Category)}
if($Id){$cliArgs+=@('--id',$Id)}
if($CommandId){$cliArgs+=@('--command-id',$CommandId)}
if($Wait){$cliArgs+=@('--wait',"$Wait")}
& npm.cmd --prefix $ProjectPath run todo -- $Verb @cliArgs
exit $LASTEXITCODE

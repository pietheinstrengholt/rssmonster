<?php
header('Content-Type: text/cache-manifest');
echo "CACHE MANIFEST\n";
 
$hashes = "";
$lastFileWasDynamic = FALSE;
 
$dir = new RecursiveDirectoryIterator(".");
foreach(new RecursiveIteratorIterator($dir) as $file) {
	if ($dir == "javascripts" || $dir == "fonts" || $dir == "favicon" || $dir == "img" || $dir == "stylesheets") {
		if ($file->IsFile() && $file != "./manifest.php" && substr($file->getFilename(), 0, 1) != ".") {
			if(preg_match('/.php$/', $file)) {
				if(!$lastFileWasDynamic) {
					echo "\n\nNETWORK:\n";
				}
				$lastFileWasDynamic = TRUE;
			} 
			else 
			{
				if($lastFileWasDynamic) {
					echo "\n\nCACHE:\n";
					$lastFileWasDynamic = FALSE;
				}
			}
			echo $file . "\n";
			$hashes .= md5_file($file);
		}
	}
}

echo "\n# Resources that require the user to be online.\n";
echo "NETWORK:\n*\n";

echo "\n# Hash: " . md5($hashes) . "\n";

?>
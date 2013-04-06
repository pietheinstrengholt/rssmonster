<html>
<head>
<link rel="stylesheet" href="stylesheets/styles.css">
</head>
<body>

<top-nav>
<?php include 'top-nav.php'; ?>
</top-nav>
<br><br>
<?php 

include 'config.php';
include 'functions.php';

if ($_FILES["file"]["error"] > 0) {
    echo "Error: " . $_FILES["file"]["error"] . "<br>";
} else {
    
    if (!array_key_exists('file', $_FILES)) {
        throw new Exception("No file uploaded!");
    }
    
    $opml = $_FILES['file'];
    if (!$opml['type'] == 'text/xml') {
        throw new Exception("Unsupported file type!: " . $opml['type']);
    }
    
    $subs = $opml['tmp_name'];
    $subs = simplexml_load_file($opml['tmp_name']);
    $subs = $subs->body;
    
    function addSubscription($xml, $tags)
    {

        // OPML Required attributes: text,xmlUrl,type
        // Optional attributes: title, htmlUrl, language, title, version
        
        if ($xml['type'] != 'rss' && $xml['type'] != 'atom') {
            $title = (string) $xml['text'];
            echo "rss type not supported for: $title<br>";
        } else {
            
            // description
            $title = (string) $xml['text'];
            
            // RSS URL
            $data['url'] = (string) $xml['xmlUrl'];
            //echo "url: $data[url]<br>";
            
            $sql=mysql_query("SELECT DISTINCT name FROM feeds ORDER BY name");
            while($r[]=mysql_fetch_array($sql));

            if (in_multiarray($title, $r)) {
              echo "SKIPPED: $title <br>";
            } else { 
              echo "ADDED: $title $data[url] <br>"; 
              $sql = "INSERT INTO feeds (name, url) VALUES ('".mysql_real_escape_string($title)."','".mysql_real_escape_string($data[url])."')";
              mysql_query($sql);
            }
        }
    }
    
    function processGroup($xml, $tags = Array())
    {
        $errors = Array();
        
        // tags are the words of the outline parent
        if ((string) $xml['title'] && $xml['title'] != '/') {
            $tags[] = (string) $xml['title'];
        }
        
        foreach ($xml->outline as $outline) {
            if ((string) $outline['type']) {
                
                //echo "Added RSS feed:<br>";
                
                $ret = addSubscription($outline, $tags);
                if ($ret !== true) {
                    $errors[] = $ret;
                }
            }
            
            if ($outline['type'] == 'folder') {
                //folder type, no functionality yet!
                echo "Folder type:<br>";
            }
            
            else {
                
                $ret = processGroup($outline, $tags);
                $errors = array_merge($errors, $ret);
            }
            
        }
    }

    //process xml feed    
    processGroup($subs);
 
}

?> 

</body>
</html>

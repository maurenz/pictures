<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
sicherheits_kopfzeilen();
header('Cache-Control: no-store');
$v = (string) @filemtime(__DIR__ . '/admin.js');
?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Verwaltung</title>
<link rel="stylesheet" href="admin.css?v=<?= htmlspecialchars($v) ?>">
<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
</head>
<body>
<div id="app" aria-live="polite"></div>
<script src="admin.js?v=<?= htmlspecialchars($v) ?>" defer></script>
</body>
</html>

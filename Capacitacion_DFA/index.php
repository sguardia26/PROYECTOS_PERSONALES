<?php
// Redirección limpia para entorno local MAMP/Apache hacia public/
header('Location: public/index.html', true, 302);
exit;

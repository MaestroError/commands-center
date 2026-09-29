UPDATE `activities` SET `level` = 'info' WHERE `kind` = 'task_completed' AND `level` <> 'info';

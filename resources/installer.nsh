; Деинсталлятор Squish (PROMPTS День 7): спросить, удалить ли данные питомца.
; В тихом режиме (/S) и при обновлении — данные не трогаем.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Удалить также данные Squish (питомец, задачи, настройки)?$\r$\nDelete Squish data too (pet, tasks, settings)?" /SD IDNO IDNO squishKeepData
      RMDir /r "$APPDATA\Squish"
    squishKeepData:
  ${endIf}
!macroend

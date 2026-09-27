; Lets students on the same Wi-Fi reach the LiveClass server without the Windows Firewall prompt.
; Private and domain networks only, matching the advice in README-teachers.txt.
!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="LiveClass"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="LiveClass" dir=in action=allow program="$INSTDIR\LiveClass.exe" enable=yes profile=private,domain'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="LiveClass"'
!macroend

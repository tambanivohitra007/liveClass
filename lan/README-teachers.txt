LIVECLASS — OFFLINE CLASSROOM GAMES
===================================

LiveClass runs entirely on this computer. No internet is needed. Students
join from any phone, tablet or laptop connected to the same Wi-Fi network.


START
-----
1. Connect this computer to the classroom Wi-Fi, or turn on its mobile
   hotspot and let students connect to it.
2. Double-click LiveClass.exe. A black window opens, then your browser.
   Keep the black window open while class is running.
3. The first time, Windows asks whether to allow LiveClass on the network.
   Tick "Private networks" and click "Allow". Without this, students cannot
   connect.
4. The first account you create is the ADMINISTRATOR. Other teachers can
   sign up afterwards; the administrator approves them under Admin > Users.


PLAY
----
- Quizzes > Create (or Import a .csv / .json / Blooket spreadsheet).
- Arcade: Gold Quest, Racing, Tower Defense and Cafe.
  Host a game and show the screen on the projector.
- Students open the address shown on screen (for example
  http://192.168.1.20:8080) or scan the QR code, then type the PIN.
  They do not need an account.


YOUR DATA
---------
Everything (accounts, quizzes, results, pictures) is saved in the folder
"liveclass-data" next to LiveClass.exe. To back up, or to move to another
computer, copy that folder while LiveClass is closed.


TROUBLESHOOTING
---------------
- Students cannot open the page:
  * Check that they are on the same Wi-Fi as this computer.
  * Allow LiveClass in Windows Defender Firewall (Private networks).
  * Some school Wi-Fi networks block devices from talking to each other
    ("client isolation"). Use this computer's hotspot instead.
- "Address in use": LiveClass is already running, or another program is
  using port 8080. LiveClass then tries 8081, 8082, and so on. Use the
  address printed in the black window.
- To use a different port, start LiveClass from a command prompt:
      set PORT=9000 && LiveClass.exe

# Keep the assisted installer strictly per-user, including when launched by an
# administrator. Skip the confusing all-users/current-user selection page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

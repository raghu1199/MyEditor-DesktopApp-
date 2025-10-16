; --- Press Delete to Type Clipboard Like a Human ---
Delete::
{
    if !ClipWait(1) {
        MsgBox "Clipboard is empty or not ready.", "Error", 48
        return
    }

    text := A_Clipboard

    if (text = "") {
        MsgBox "Clipboard is empty.", "Error", 48
        return
    }

    chars := StrSplit(text)

    for k, char in chars {
        ; Type the character
        SendEvent char

        ; Random typing delay (simulate human variation)
        delay := Random(60, 160)
        Sleep delay

        ; Every ~15 characters, insert a longer pause
        if (Mod(k, 15) = 0) {
            pause := Random(250, 600)
            Sleep pause
        }
    }
}

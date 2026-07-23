-- I messaggi della bacheca si cancellano da soli dopo 24 ore. Serve sapere
-- quando è stata creata anche ogni mappatura dei messaggi del bot, così si
-- ripulisce per età senza sottoquery (più semplice e portabile).
ALTER TABLE bacheca_msg_map ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

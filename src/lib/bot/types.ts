// Минимальные типы Telegram Bot API, которые использует бот.

export type TgUser = { id: number; is_bot?: boolean; first_name?: string; username?: string };

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  reply_to_message?: { message_id: number };
};

export type TgCallback = {
  id: string;
  from: TgUser;
  message?: { message_id: number; chat: { id: number } };
  data?: string;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
};

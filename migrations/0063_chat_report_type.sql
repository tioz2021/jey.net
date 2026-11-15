-- Reports can target an individual chat message.
ALTER TABLE reports
    DROP CONSTRAINT reports_target_type_check;

ALTER TABLE reports
    ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('item', 'comment', 'profile', 'chat_message'));

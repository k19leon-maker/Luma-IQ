import { describe, expect, it } from 'vitest';
import {
  addSheetTags,
  normalizePhone,
  renderConferenceMessage,
  sheetBoolean,
  telegramMembershipConfirmed,
  testAccountAllowed,
  validTelegramJoinUrl,
} from '../../src/services/telegram-conference-sheets.logic';

describe('telegram conference Google Sheets logic', () => {
  it('normalizes Telegram contact phone numbers', () => {
    expect(normalizePhone('8 (995) 502-27-04')).toBe('+79955022704');
    expect(normalizePhone('+7 995 502 27 04')).toBe('+79955022704');
  });

  it('accepts only Telegram member states that prove current membership', () => {
    expect(telegramMembershipConfirmed({ status: 'creator' })).toBe(true);
    expect(telegramMembershipConfirmed({ status: 'administrator' })).toBe(true);
    expect(telegramMembershipConfirmed({ status: 'member' })).toBe(true);
    expect(telegramMembershipConfirmed({ status: 'restricted', is_member: true })).toBe(true);
    expect(telegramMembershipConfirmed({ status: 'restricted', is_member: false })).toBe(false);
    expect(telegramMembershipConfirmed({ status: 'left' })).toBe(false);
  });

  it('keeps the test runtime limited by Telegram ID or username', () => {
    expect(testAccountAllowed({
      telegramUserId: '8670353990',
      username: 'stork_hotel_team',
      allowedUserIds: '8670353990',
      allowedUsernames: 'dleonid_biz',
    })).toBe(true);
    expect(testAccountAllowed({
      telegramUserId: '1',
      username: '@DLEONID_BIZ',
      allowedUserIds: '',
      allowedUsernames: 'dleonid_biz,stork_hotel_team',
    })).toBe(true);
    expect(testAccountAllowed({
      telegramUserId: '2',
      username: 'visitor',
      allowedUserIds: '8670353990',
      allowedUsernames: 'dleonid_biz',
    })).toBe(false);
  });

  it('renders escaped subscriber variables and validates configuration values', () => {
    expect(renderConferenceMessage('Здравствуйте, {{first_name}}!', { first_name: '<Леонид>' }))
      .toBe('Здравствуйте, &lt;Леонид&gt;!');
    expect(sheetBoolean('TRUE')).toBe(true);
    expect(validTelegramJoinUrl('https://t.me/example')).toBe(true);
    expect(validTelegramJoinUrl('https://example.com/channel')).toBe(false);
    expect(addSheetTags('test;start_received', 'phone_validated', 'test'))
      .toBe('test;start_received;phone_validated');
  });
});

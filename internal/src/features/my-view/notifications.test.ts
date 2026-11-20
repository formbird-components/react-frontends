import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, messageExcerpt, notificationLink, parseSubject } from './notifications';

// The shape of the server's SDMS email (shortened), as internal-5 stores it.
const EMAIL = `<head> <meta charset='UTF-8'> <title>x</title> <style> .btn a { color: red; } </style> </head>
<body style='font-size: 14px'> <span class='preheader'>  </span> <table role='presentation'><tr><td class='container'>
  <div class="emailBody">
    <div>
      <p>retested on comp-dev using &quot;meta&quot; data &amp; it&#39;s working - </p>
      <h2><img src='https://cdn.formbird.com/logo.png' />FORMBIRD SDMS</h2>
      <div>
        The following item has a note added.<br/>
        <a href="https://internal.formbird.com/form/71422335-f791-40f3-aa6e-27c180102628">0031313 - EXIF &lt;changes&gt;</a>
      </div>
      <div>
        <hr/>
        Reported By:                Michael Marshall<br/>
        Assigned To:                Kristian Arendain<br/>
      </div>
      <script>alert(1)</script>
    </div>
  </div>
</td></tr><tr><td><div class='footer'>Powered by <br><a href='https://www.formbird.com/'><img src='logo.png'></a></div></td></tr></table></body>`;

describe('htmlToText', () => {
  it('keeps the words, one block a line, without the head, styles, scripts or the email’s own chrome', () => {
    expect(htmlToText(EMAIL)).toBe(
      [
        'retested on comp-dev using "meta" data & it\'s working -',
        'The following item has a note added.',
        '0031313 - EXIF <changes>',
        '',
        'Reported By: Michael Marshall',
        'Assigned To: Kristian Arendain',
      ].join('\n'),
    );
  });
  it('never returns markup: tags are text-free, decoded brackets stay text', () => {
    const text = htmlToText('<img src=x onerror="alert(1)"><b>Bold</b> &lt;script&gt;');
    expect(text).toBe('Bold <script>');
  });
  it('is empty for nothing', () => {
    expect(htmlToText(undefined)).toBe('');
    expect(htmlToText('')).toBe('');
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities, and leaves unknown ones', () => {
    expect(decodeEntities('&amp; &#8211; &#x2014; &nbsp;&bogus;')).toBe('& – —  &bogus;');
  });
});

describe('notificationLink', () => {
  it('finds the item the email links to, as a page here', () => {
    expect(notificationLink(EMAIL)).toEqual({
      href: 'https://internal.formbird.com/form/71422335-f791-40f3-aa6e-27c180102628',
      text: '0031313 - EXIF <changes>',
      to: '/items/71422335-f791-40f3-aa6e-27c180102628',
    });
  });
  it('takes single-quoted and relative links, and skips links that aren’t to a form', () => {
    const html = `<a href='https://www.formbird.com/'>Formbird</a> <a class="x" href='/form/abc-123'>0000042 - Thing</a>`;
    expect(notificationLink(html)).toEqual({ href: '/form/abc-123', text: '0000042 - Thing', to: '/items/abc-123' });
  });
  it('is null without a link to an item', () => {
    expect(notificationLink('<p>No links</p>')).toBeNull();
    expect(notificationLink("<a href='https://www.formbird.com/'>x</a>")).toBeNull();
    expect(notificationLink(undefined)).toBeNull();
  });
});

describe('parseSubject', () => {
  it('splits an SDMS subject into the project, the number and what happened', () => {
    expect(parseSubject('SDMS [FieldTec3 0031313]- Note added to Item')).toEqual({ event: 'Note added to Item', project: 'FieldTec3', itemId: '0031313' });
    expect(parseSubject('SDMS [Formbird - Greater Western Water (Focus3) 0031671]- Item status changed (Awaiting related item).')).toEqual({
      event: 'Item status changed (Awaiting related item)',
      project: 'Formbird - Greater Western Water (Focus3)',
      itemId: '0031671',
    });
  });
  it('keeps other subjects whole', () => {
    expect(parseSubject('SDMS weekly digest')).toEqual({ event: 'weekly digest' });
    expect(parseSubject(undefined)).toEqual({ event: '(no subject)' });
  });
});

describe('messageExcerpt', () => {
  it('flattens and shortens', () => {
    expect(messageExcerpt('a\n\nb  c')).toBe('a b c');
    expect(messageExcerpt('x'.repeat(20), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

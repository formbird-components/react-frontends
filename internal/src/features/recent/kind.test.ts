import { describe, expect, it } from 'vitest';
import { decodeEntities, isItem, kindOf, words } from './kind';

const doc = (systemType: string, appTags?: string[]) => ({ systemHeader: { systemType }, appTags });

describe('kind of a recent document', () => {
  it('items and releases', () => {
    expect(kindOf(doc('document', ['sdms', 'item']))).toBe('Item');
    expect(kindOf(doc('document', ['releaseItem', 'sdms', 'item']))).toBe('Release');
    expect(isItem(doc('document', ['releaseItem', 'sdms', 'item']))).toBe(true);
    expect(isItem(doc('document', ['system', 'emailMessage']))).toBe(false);
  });
  it('other documents by their most specific tag', () => {
    expect(kindOf(doc('document', ['system', 'emailMessage']))).toBe('Email message');
    expect(kindOf(doc('document', ['system', 'account', 'login']))).toBe('Login');
    expect(kindOf(doc('document', ['sdms', 'notifyConfiguration']))).toBe('Notify configuration');
    expect(kindOf(doc('document', ['sdms', 'status', 'sdmsConfig']))).toBe('Status');
    expect(kindOf(doc('document', ['crm', 'action', 'crmAction']))).toBe('Action');
    expect(kindOf(doc('document', []))).toBe('Document');
  });
  it('system types', () => {
    expect(kindOf(doc('fileReference'))).toBe('Uploaded file');
    expect(kindOf(doc('template', ['system']))).toBe('Template');
    expect(kindOf(doc('someNewType'))).toBe('Some new type');
  });
  it('words', () => {
    expect(words('formbirdUserGuideTopic')).toBe('Formbird user guide topic');
    expect(words('sdmsConfig')).toBe('Config');
    expect(words('URLRoute')).toBe('URL route');
  });
});

describe('names', () => {
  it('turns entities back into characters', () => {
    expect(decodeEntities('Dion O&#x27;Neill Login Activity')).toBe("Dion O'Neill Login Activity");
    expect(decodeEntities('R&amp;D &lt;draft&gt; &#39;x&#39; &unknown;')).toBe("R&D <draft> 'x' &unknown;");
  });
});

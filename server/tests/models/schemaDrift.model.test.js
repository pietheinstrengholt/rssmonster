import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';

const { Article, Feed, Hotlink, Setting, User } = db;

describe('model schema declarations', () => {
  it('keeps model uniqueness in sync with migrations', () => {
    expect(User.rawAttributes.username.unique).toBe(true);
    expect(User.rawAttributes.hash.unique).toBe(true);
    expect(Setting.rawAttributes.userId.unique).toBe(true);
    expect(Feed.options.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unique: true,
          fields: ['userId', 'url']
        })
      ])
    );
  });

  it('declares developing-event presentation disabled by default', () => {
    expect(Setting.rawAttributes.includeDevelopingEvents).toMatchObject({
      allowNull: false,
      defaultValue: false
    });
  });

  it('declares last-used as the default startup view mode', () => {
    expect(Setting.rawAttributes.startupViewMode).toMatchObject({
      allowNull: false,
      defaultValue: 'last-used'
    });
  });

  it('keeps hotlink timestamps in sync with migrations', () => {
    expect(Hotlink.rawAttributes.createdAt).toMatchObject({
      allowNull: true
    });
    expect(Hotlink.options.updatedAt).toBe(false);
    expect(Hotlink.options.createdAt).not.toBe(false);
  });

  it('declares required feed ownership columns explicitly', () => {
    expect(Feed.rawAttributes.userId.allowNull).toBe(false);
    expect(Feed.rawAttributes.categoryId.allowNull).toBe(false);
  });

  it('declares sanitized article display content as contentHtml', () => {
    expect(Article.rawAttributes.contentHtml).toMatchObject({
      allowNull: true,
      defaultValue: null
    });
    expect(Article.rawAttributes.contentStripped).toBeUndefined();
  });

  it('declares publisher-controlled article fields with expanded storage', () => {
    expect(Article.rawAttributes.imageUrl.type.toString()).toBe('TEXT');
    expect(Article.rawAttributes.description.type.toString()).toBe('MEDIUMTEXT');
    expect(Article.rawAttributes.contentHtml.type.toString()).toBe('MEDIUMTEXT');
    expect(Article.rawAttributes.contentText.type.toString()).toBe('MEDIUMTEXT');
  });

  it('declares separate article publication and modification timestamps', () => {
    expect(Article.rawAttributes.publishedAt.allowNull).toBe(false);
    expect(Article.rawAttributes.modifiedAt).toMatchObject({
      allowNull: true,
      defaultValue: null
    });
    expect(Article.rawAttributes.published).toBeUndefined();
  });

  it('declares filtered articles with a false default', () => {
    expect(Article.rawAttributes.filteredInd).toMatchObject({
      allowNull: false,
      defaultValue: false
    });
  });

  it('declares original source identity as contentSourceHash', () => {
    expect(Article.rawAttributes.contentSourceHash).toMatchObject({
      allowNull: true
    });
    expect(Article.rawAttributes.contentHash).toBeUndefined();
  });

  it('declares visible-text identity as contentTextHash', () => {
    expect(Article.rawAttributes.contentTextHash).toMatchObject({
      allowNull: true
    });
    expect(Article.rawAttributes.contentStrippedHash).toBeUndefined();
  });

  it('declares the article embedding as articleVector', () => {
    expect(Article.rawAttributes.articleVector).toMatchObject({
      allowNull: true
    });
    expect(Article.rawAttributes.vector).toBeUndefined();
  });
});

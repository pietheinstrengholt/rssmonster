import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';

const { Article, Feed, Hotlink, Setting, SmartFolder, User } = db;

describe('model schema declarations', () => {
  it('keeps model uniqueness in sync with migrations', () => {
    expect(User.rawAttributes.username.unique).toBe(true);
    expect(User.rawAttributes.feverCredentialHash.unique).toBe(true);
    expect(User.rawAttributes.bootstrapAdminClaim).toMatchObject({
      allowNull: true,
      defaultValue: null,
      unique: true
    });
    expect(Setting.rawAttributes.userId.unique).toBe(true);
    expect(User.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'users_email_unique',
        unique: true,
        fields: ['email']
      })
    ]));
    expect(Feed.options.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unique: true,
          fields: ['userId', 'url']
        })
      ])
    );
  });

  it('declares the MySQL article full-text index used by search queries', () => {
    if (db.sequelize.getDialect() !== 'mysql') {
      expect(Article.options.indexes).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'articles_title_contentText_fulltext_idx' })
        ])
      );
      return;
    }

    expect(Article.options.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'articles_title_contentText_fulltext_idx',
          fields: ['title', 'contentText'],
          type: 'FULLTEXT'
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

  it('declares generic high-trust prioritization disabled by default', () => {
    expect(Setting.rawAttributes.prioritizeHighTrust).toMatchObject({
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

  it('declares automatic mark-as-read scrolling enabled by default', () => {
    expect(Setting.rawAttributes.markAsReadOnScroll).toMatchObject({
      allowNull: false,
      defaultValue: true
    });
  });

  it('declares Smart Folder mark-as-read scrolling disabled by default', () => {
    expect(SmartFolder.rawAttributes.markAsReadOnScroll).toMatchObject({
      allowNull: false,
      defaultValue: false
    });
  });

  it('keeps hotlink timestamps in sync with migrations', () => {
    expect(Hotlink.rawAttributes.createdAt).toMatchObject({
      allowNull: true
    });
    expect(Hotlink.options.updatedAt).toBe(false);
    expect(Hotlink.options.createdAt).not.toBe(false);
  });

  it('declares optional hotlink source article provenance', () => {
    expect(Hotlink.rawAttributes.sourceArticleId).toMatchObject({
      allowNull: true,
      defaultValue: null
    });
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

  it('allows stable-ID articles without an external URL', () => {
    for (const field of ['url', 'urlHash', 'normalizedUrl', 'normalizedUrlHash']) {
      expect(Article.rawAttributes[field].allowNull).toBe(true);
    }
  });

  it('declares publisher-controlled article fields with expanded storage', () => {
    const expandedTextType = db.sequelize.getDialect() === 'sqlite'
      ? 'TEXT'
      : 'MEDIUMTEXT';

    expect(Article.rawAttributes.imageUrl.type.toString()).toBe('TEXT');
    expect(Article.rawAttributes.description.type.toString()).toBe(expandedTextType);
    expect(Article.rawAttributes.descriptionHtml.type.toString()).toBe(expandedTextType);
    expect(Article.rawAttributes.descriptionText.type.toString()).toBe(expandedTextType);
    expect(Article.rawAttributes.contentHtml.type.toString()).toBe(expandedTextType);
    expect(Article.rawAttributes.contentText.type.toString()).toBe(expandedTextType);
  });

  it('declares separate article publication and modification timestamps', () => {
    expect(Article.rawAttributes.publishedAt.allowNull).toBe(false);
    expect(Article.rawAttributes.modifiedAt).toMatchObject({
      allowNull: true,
      defaultValue: null
    });
    expect(Article.rawAttributes.published).toBeUndefined();
  });

  it('declares an optional explicit article read timestamp', () => {
    expect(Article.rawAttributes.readAt).toMatchObject({
      allowNull: true,
      defaultValue: null
    });
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

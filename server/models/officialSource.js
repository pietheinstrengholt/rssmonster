import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const OfficialSource = sequelize.define(
    'official_sources',
    {
      // Provides the stable identifier for this official-source rule.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the user whose articles are classified by this rule.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Names the organization or entity represented by the official domain.
      entity: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      // Stores the normalized domain matched against article URLs for this user.
      domain: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      // Controls whether this domain currently marks matching articles as official.
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      indexes: [
        { fields: ['userId'] },
        { fields: ['userId', 'entity'] },
        {
          unique: true,
          fields: ['userId', 'domain']
        }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return OfficialSource;
};

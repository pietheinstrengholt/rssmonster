'use strict';

module.exports = {
  // This migration gives the protected Fever credential column an explicit name.
  up: queryInterface =>
    queryInterface.renameColumn(
      'users',
      'hash',
      'feverCredentialHash'
    ),

  // This migration restores the previous generic column name.
  down: queryInterface =>
    queryInterface.renameColumn(
      'users',
      'feverCredentialHash',
      'hash'
    )
};

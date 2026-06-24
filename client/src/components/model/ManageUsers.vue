<template>
  <div class="manage-users">
    <div v-if="userIdToDelete">
              <section class="manage-users__confirmation" aria-labelledby="delete-user-title">
                <p class="manage-users__eyebrow">Destructive action</p>
                <h6 id="delete-user-title">Delete {{ user.username }}?</h6>
                <p>This permanently removes the account and its access to RSSMonster.</p>
                <div class="manage-users__form-actions">
                  <button class="btn btn-remove" @click="deleteUser(userIdToDelete)">Delete user</button>
                  <button class="btn btn-secondary" @click="returnToUserList">Cancel</button>
                </div>
              </section>
              <p v-if="message" class="manage-users__message manage-users__message--error">{{ message }}</p>
            </div>

    <div v-else-if="user" class="manage-users__editor">
              <div class="manage-users__section-heading">
                <div>
                  <p class="manage-users__eyebrow">Account details</p>
                  <h6>Edit {{ user.username }}</h6>
                </div>
              </div>
              <div class="manage-users__field">
                <label for="username">Username</label>
                <input id="username" disabled class="form-control" type="text" v-model="user.username" />
              </div>
              <div class="manage-users__field">
                <label for="role">Role</label>
                <select id="role" class="form-select" v-model="user.role" aria-label="Select role">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div class="manage-users__field">
                <label for="password">New password <span>Optional</span></label>
                <input id="password" class="form-control" type="password" placeholder="Leave blank to keep the current password" />
              </div>
              <div class="manage-users__field">
                <label for="password-repeat">Confirm new password</label>
                <input id="password-repeat" class="form-control" type="password" placeholder="Repeat the new password" />
              </div>
              <div class="manage-users__form-actions">
                <button type="button" class="btn btn-primary" @click="updateUser">Save changes</button>
                <button type="button" class="btn btn-secondary" @click="returnToUserList">Cancel</button>
              </div>
              <p v-if="message" class="manage-users__message manage-users__message--error">{{ message }}</p>
            </div>

    <div v-else class="manage-users__directory">
              <p v-if="message" class="manage-users__message manage-users__message--success">{{ message }}</p>
              <div v-if="users.length !== 0" class="manage-users__table-wrap">
                <table class="manage-users__table">
                  <thead>
                    <tr>
                      <th scope="col">User</th>
                      <th scope="col">Role</th>
                      <th scope="col" class="manage-users__actions-heading">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="listedUser in users" :key="listedUser.id">
                      <td>
                        <div class="manage-users__identity">
                          <span class="manage-users__avatar" aria-hidden="true">{{ listedUser.username.charAt(0).toUpperCase() }}</span>
                          <div>
                            <span class="manage-users__username">{{ listedUser.username }}</span>
                            <span class="manage-users__id">User #{{ listedUser.id }}</span>
                          </div>
                        </div>
                      </td>
                      <td><span class="manage-users__role" :class="{ 'manage-users__role--admin': listedUser.role === 'admin' }">{{ listedUser.role }}</span></td>
                      <td>
                        <div class="manage-users__actions">
                          <button class="manage-users__action" @click="editUser(listedUser.id)">Edit</button>
                          <button class="manage-users__action manage-users__action--remove" @click="showDeleteForm(listedUser.id)">Delete</button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="manage-users__empty">
                <i class="bi bi-people" aria-hidden="true"></i>
                <p>No users found.</p>
              </div>
    </div>
  </div>
</template>

<style scoped>
.manage-users__header {
  align-items: flex-start;
  border-bottom: 1px solid var(--border-subtle);
  padding: 24px 28px 20px;
}

.manage-users__eyebrow {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.manage-users__header .modal-title,
.manage-users__section-heading h6,
.manage-users__confirmation h6 {
  color: var(--text-primary);
  font-weight: 600;
}

.manage-users__header .modal-title {
  font-size: 20px;
}

.manage-users__subtitle {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 14px;
}

.manage-users__count {
  background: var(--bg-secondary);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  margin-top: 4px;
  padding: 7px 10px;
}

.modal-body {
  padding: 0;
}

.manage-users__table-wrap {
  overflow-x: auto;
}

.manage-users__table {
  border-collapse: collapse;
  width: 100%;
}

.manage-users__table th {
  background: var(--bg-surface-muted);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 11px 28px;
  text-align: left;
  text-transform: uppercase;
}

.manage-users__table td {
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 15px 28px;
  vertical-align: middle;
}

.manage-users__table tbody tr:last-child td {
  border-bottom: 0;
}

.manage-users__table tbody tr:hover {
  background: var(--bg-hover);
}

.manage-users__actions-heading {
  text-align: right !important;
}

.manage-users__identity {
  align-items: center;
  display: flex;
  gap: 11px;
}

.manage-users__avatar {
  align-items: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 50%;
  color: var(--color-primary);
  display: inline-flex;
  font-size: 13px;
  font-weight: 700;
  height: 32px;
  justify-content: center;
  text-transform: uppercase;
  width: 32px;
}

.manage-users__username,
.manage-users__id {
  display: block;
}

.manage-users__username {
  font-size: 14px;
  font-weight: 600;
}

.manage-users__id {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 2px;
}

.manage-users__role {
  background: var(--bg-secondary);
  border-radius: 999px;
  color: var(--text-secondary);
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 6px 9px;
  text-transform: capitalize;
}

.manage-users__role--admin {
  background: var(--bg-info-subtle);
  color: var(--text-info);
}

.manage-users__actions {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}

.manage-users__action {
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 8px;
}

.manage-users__action:hover {
  background: var(--bg-secondary);
  color: var(--color-primary-hover);
}

.manage-users__action--remove {
  color: var(--color-danger);
}

.manage-users__action--remove:hover {
  color: var(--color-danger-hover);
}

.manage-users__editor,
.manage-users__confirmation {
  margin: 0 auto;
  max-width: 580px;
  padding: 28px;
}

.manage-users__confirmation {
  background: var(--bg-danger-subtle);
  max-width: none;
}

.manage-users__confirmation h6,
.manage-users__section-heading h6 {
  font-size: 17px;
  margin: 0;
}

.manage-users__confirmation > p:not(.manage-users__eyebrow) {
  color: var(--text-secondary);
  margin: 8px 0 0;
}

.manage-users__field {
  margin-top: 20px;
}

.manage-users__field label {
  color: var(--text-secondary);
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 7px;
}

.manage-users__field label span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 400;
}

.manage-users__field .form-control,
.manage-users__field .form-select {
  background-color: var(--bg-input);
  border-color: var(--border-input);
  color: var(--text-primary);
}

.manage-users__field .form-control:disabled {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  opacity: 1;
}

.manage-users__form-actions {
  display: flex;
  gap: 8px;
  margin-top: 26px;
}

.manage-users__form-actions .btn {
  margin: 0;
}

.manage-users__message {
  border-radius: 4px;
  font-size: 13px;
  margin: 20px 28px 0;
  padding: 10px 12px;
}

.manage-users__message--error {
  background: var(--bg-danger-subtle);
  color: var(--text-danger);
}

.manage-users__message--success {
  background: var(--bg-secondary);
  color: var(--color-success);
}

.manage-users__empty {
  color: var(--text-muted);
  padding: 52px 28px;
  text-align: center;
}

.manage-users__empty i {
  display: block;
  font-size: 24px;
  margin-bottom: 10px;
}

.manage-users__empty p {
  margin: 0;
}

@media (max-width: 600px) {
  .manage-users__header,
  .manage-users__editor,
  .manage-users__confirmation {
    padding-left: 20px;
    padding-right: 20px;
  }

  .manage-users__table th,
  .manage-users__table td {
    padding-left: 16px;
    padding-right: 16px;
  }

  .manage-users__table th:nth-child(2),
  .manage-users__table td:nth-child(2) {
    display: none;
  }

  .manage-users__actions {
    gap: 0;
  }
}
</style>

<script>
import { fetchUsers, updateUser, deleteUser } from '../../api/users';
import { setAuthToken } from '../../api/client';

export default {
    name: 'ManageUsers',
    emits: ['close'],
    created: function() {
        setAuthToken(this.$store.auth.token);
        this.fetchUsers(); // Fetch users when the component is created
    },
    data() {
        return {
          users: [], // This will hold the list of users
          user: null, // This will hold the user being edited
          message: '',
          userIdToDelete: null // This will hold the ID of the deleted user
        };
    },
    methods: {
      async fetchUsers() {
        try {
          const response = await fetchUsers();
          this.users = response.data.users;
        } catch (error) {
          console.error("Error fetching users:", error);
        }
      },
      editUser(userId) {
        // Find the user by ID and set it to the user data property
        const user = this.users.find(user => user.id === userId);
        this.user = JSON.parse(JSON.stringify(user));
        // You can implement the logic to open a modal or redirect to an edit page
      },
      returnToUserList() {
        this.user = null; // Clear the user being edited
        this.userIdToDelete = null; // Clear the user ID to delete
        this.message = null; // Clear any previous messages
        this.fetchUsers(); // Refresh the user list
      },
      async updateUser() {
        // Logic to update user
        const userPassword = this.$el.querySelector('#password').value;
        const userPasswordRepeat = this.$el.querySelector('#password-repeat').value;

        try {
          // Validate password length
          if (userPassword.length > 0) {
            if (userPassword.length < 8) {
              this.message = "Password must be at least 8 characters long";
              throw new Error("Password must be at least 8 characters long");
            }

            if (userPassword !== userPasswordRepeat) {
              this.message = "Passwords do not match";
              throw new Error("Passwords do not match");
            }
          }

          await updateUser(this.user.id, {
            username: this.user.username,
            role: this.user.role,
            password: userPassword
          });
          this.message = null;
          this.user = null;
          this.fetchUsers();
        } catch (error) {
          console.error("Error updating user:", error);
          this.message = error.message || "Error updating user";
        }
      },
      async deleteUser(userId) {
        // Logic to delete user
        try {
          await deleteUser(userId);
          this.fetchUsers();
          this.user = null;
          this.userIdToDelete = null;
          this.message = "User deleted successfully";
        } catch (error) {
          console.error("Error deleting user:", error);
          this.message = "Error deleting user. " + (error.response?.data?.message || error.message);
        }
      },
      showDeleteForm(userId) {
        // Find the user by ID and set it to the user data property
        const user = this.users.find(user => user.id === userId);
        this.user = JSON.parse(JSON.stringify(user));
        this.userIdToDelete = userId; // Set the ID of the user to be deleted
      }
    }
}
</script>

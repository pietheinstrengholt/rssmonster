<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Manage Users</h5>
            </div>
              <!-- This piece of code is for managing users users -->
              <div class="modal-body">
                <div v-if="userIdToDelete">
                  <div class="form-group" id="manage-user">
                      <p class="font-bold text-lg mb-4" id="signin">Delete user: {{ user.username }}</p>
                      <p>Are you sure you want to delete this user?</p>
                      <button class="btn btn-danger" @click="deleteUser(userIdToDelete)">Yes, delete</button>
                      <button class="btn btn-secondary" @click="returnToUserList">No, cancel</button>
                  </div>
                  <!-- Error message -->
                  <p class="text-danger" v-if="message">{{ message }}</p>
                </div>
                <div v-if="user && !userIdToDelete">
                  <div class="form-group" id="manage-user">
                      <p class="font-bold text-lg mb-4" id="signin">Edit user</p>
                      <div class="form-group row">
                          <label class="col-sm-2 col-form-label">Username</label>
                          <div class="col-sm-10">
                          <input disabled class="form-control" type="text" placeholder="Username" v-model="user.username" />
                          </div>
                      </div>
                      <div class="form-group row">
                          <label class="col-sm-2 col-form-label">Role</label>
                          <div class="col-sm-10">
                              <select class="form-select" id="role" v-model="user.role" aria-label="Select role">
                                  <option value="user">User</option>
                                  <option value="admin">Admin</option>
                              </select>
                          </div>
                      </div>
                      <div class="form-group row">
                          <label  class="col-sm-2 col-form-label">Password</label>
                          <div class="col-sm-10">
                              <input id="password" class="form-control" type="password" placeholder="Password" />
                          </div>
                      </div>
                      <div class="form-group row">
                          <label class="col-sm-2 col-form-label">Password</label>
                          <div class="col-sm-10">
                              <input id="password-repeat" class="form-control" type="password" placeholder="Password (repeat)" />
                          </div>
                      </div>
                      <div class="form-group row" id="buttons">
                          <div class="col-sm-10">
                            <button type="submit" class="btn btn-primary" @click="updateUser" value="Update">Update</button>
                            <button type="submit" class="btn btn-primary" @click="returnToUserList" value="Update">Return to User List</button>
                          </div>
                      </div>
                      <!-- Error message -->
                      <p class="text-danger" v-if="message">{{ message }}</p>
                  </div>
                </div>
                <!-- User list -->
                <div v-if="!user && !userIdToDelete">            
                  <table v-if="users.length !== 0" class="table table-striped">
                    <thead>
                      <tr>
                        <th scope="col">ID</th>
                        <th scope="col">Username</th>
                        <th scope="col">Role</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="user in users" :key="user.id">
                        <td>{{ user.id }}</td>
                        <td>{{ user.username }}</td>
                        <td>{{ user.role }}</td>
                        <td>
                          <button class="btn btn-danger" @click="showDeleteForm(user.id)">Delete</button>
                          <button class="btn btn-primary" @click="editUser(user.id)">Edit</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p v-else>No users found.</p>
                </div>

              </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="$store.data.setShowModal('')">Close</button>
            </div>
            </div>
        </div>
    </div>
</template>

<style>
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-dialog{
    max-width: 90%;
    width: 100%;
}

.btn {
    margin-left: 5px;
}

.row {
    margin-bottom: 10px;
    margin-top: 10px;
}

#buttons {
    margin-top: 20px;
}

.text-danger {
    margin-top: 40px;
    margin-bottom: 20px;
    color: red;
}

select#role {
    margin-left: 20px;
}
</style>

<script>
import axios from 'axios';

export default {
    name: 'ManageUsers',
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
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
        await setTimeout(() => {
          axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + '/api/users')
            .then(response => {
              this.users = response.data.users; // Store the fetched users in the component's data
            })
            .catch(error => {
              console.error("Error fetching users:", error);
            });
        }, 100);
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

          await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + '/api/users/' + this.user.id, {
            username: this.user.username,
            role: this.user.role,
            password: userPassword
          }).then(_response => {
            this.message = null; // Clear any previous messages
            this.user = null; // Clear the user being edited, return to user list
            this.fetchUsers(); // Refresh the user list
          }).catch(error => {
            console.error("Error updating user:", error);
            this.message = "Error updating user";
          });
        } catch (error) {
          console.error("Password validation error:", error);
          this.message = error.message;
          return;
        }
      },
      deleteUser(userId) {
        // Logic to delete user
        axios.delete(import.meta.env.VITE_VUE_APP_HOSTNAME + '/api/users/' + userId)
          .then(_response => {
            this.fetchUsers(); // Refresh the user list after deletion
            this.user = null;
            this.userIdToDelete = null; // Clear the user ID to delete
            this.message = "User deleted successfully"; // Set a success message
          })
          .catch(error => {
            console.error("Error deleting user:", error);
            this.message = "Error deleting user. " + error.response.data.message; // Set an error message
          });

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
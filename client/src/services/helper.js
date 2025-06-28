export default {
    arrayRemove(arr, value) {
        //filter function to remove item from an array
        return arr.filter(function(ele) {
            return ele != value;
        });
    },
    // This function finds the array by searching on its id
    findArrayById: function(array, id) {
        var index = -1
        for(var i = 0; i < array.length; i++) {
            if(array[i].id == id) {
                index = i;
                break;
            }
        }
        return array[index];
    },
    // This function finds the index of an object in an array by its id
    findIndexById: function(array, id) {
        var index = -1
        for(var i = 0; i < array.length; i++) {
            if(array[i].id == id) {
                index = i;
                break;
            }
        }
        return index;
    }
};
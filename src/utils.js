export function removeItem(array, item) {
    for (var i = array.length - 1; i >= 0; i--)
        if (array[i] === item) {
            array.splice(i, 1);
            break;
        }
}
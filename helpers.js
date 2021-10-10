const $q = (path, root = document.body) => root.querySelector(path);
const $Q = (path, root = document.body) => root.querySelectorAll(path);
const $id = id => document.getElementById(id);
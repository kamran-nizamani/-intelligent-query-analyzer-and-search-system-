function normalizeName(input) {
  return input.trim().toLowerCase();
}

class UserManager {
  findUser(id) {
    return lookupUser(id);
  }
}

const parseCsv = (text) => text.split("\n");

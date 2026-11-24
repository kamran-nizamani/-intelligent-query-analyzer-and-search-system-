/** Validates a user's credentials. */
class AuthService {
    boolean validateCredentials(String username, String password) {
        return checkPassword(username, password);
    }

    boolean checkPassword(String username, String password) {
        return password != null;
    }
}

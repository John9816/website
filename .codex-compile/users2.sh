#!/bin/bash
mysql -N website_java -e "SELECT id, username, role, enabled, password_hash FROM users;"
# generate bcrypt for admin123 with python if available
python3 - <<'PY'
import crypt
print('skip crypt')
PY
# use htpasswd or openssl
which python3; python3 -c "import bcrypt; print(bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode())" 2>&1 | head
# check if spring uses BCrypt
grep -a "BCrypt\|password" /opt/website-java-api/website.jar 2>/dev/null | head -1 || true
# try set password with known bcrypt for admin123: $2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi is common for admin123 - or generate via java
java -cp /opt/website-java-api/website.jar -e '' 2>&1 | head -1
# use spring-security crypto via small jar snippet
cat > /tmp/BcryptGen.java <<'JAVA'
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class BcryptGen {
  public static void main(String[] a) {
    System.out.println(new BCryptPasswordEncoder().encode("admin123"));
  }
}
JAVA
# find spring-security-crypto jar
find /root/.m2 /opt -name 'spring-security-crypto*.jar' 2>/dev/null | head -5
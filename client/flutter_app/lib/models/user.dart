class User {
  final int id;
  final String fullName;
  final String email;
  final String role;
  final String? profileImageUrl;

  const User({
    required this.id,
    required this.fullName,
    required this.email,
    required this.role,
    this.profileImageUrl,
  });

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'] as int,
        fullName: j['full_name'] as String? ?? '',
        email: j['email'] as String? ?? '',
        role: j['role'] as String? ?? 'user',
        profileImageUrl: j['profile_image_url'] as String?,
      );
}

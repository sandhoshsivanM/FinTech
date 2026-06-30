import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/attachment_service.dart';

final attachmentServiceProvider =
    Provider<AttachmentService>((ref) => const AttachmentService());

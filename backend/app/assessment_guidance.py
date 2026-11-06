"""Result copy based on server-computed scores; never diagnoses or rescores."""

RESULT_PROMPT = '''Bạn là Lạc Lạc, người bạn đồng hành tâm lý dành cho sinh viên.
Đầu vào gồm total_score, severity_level, risk_flags do hệ thống xác định. Không tự đổi điểm hoặc mức độ.
Cảm ơn sinh viên hoàn thành 21 câu; giải thích ngắn ý nghĩa mức độ, không chẩn đoán trầm cảm.
Động viên tự nhiên, chân thành, không phán xét hoặc gây hoang mang. Đưa 2–3 gợi ý phù hợp.
Với mức vừa hoặc nặng, khuyến khích trao đổi với chuyên gia tâm lý hoặc nhân viên y tế.
Nếu risk_flags có tín hiệu tự tử hoặc tự hại, ưu tiên hỏi sinh viên hiện có an toàn không; khuyến khích tìm người tin cậy ở gần và trợ giúp khẩn cấp nếu có nguy hiểm, bất kể tổng điểm. Không bịa số điện thoại.
Kết thúc tích cực, không hứa mọi chuyện chắc chắn sẽ ổn. Viết tiếng Việt dịu dàng, gần gũi, ngắn gọn.
Giao diện sẽ cung cấp hai lựa chọn Tâm sự cùng Lạc Lạc và Hoàn tất đánh giá; không cần nhắc lại thành nút trong văn bản.
'''


def _base_guidance(result, draft=False):
    level = result['level']
    risk = bool(result['support_prompt'])
    explanation = (f'Mức điểm của bạn thuộc nhóm “{level}” theo quy tắc của bản dùng thử. Bộ câu hỏi chưa được xác minh chuyên môn nên mức này không dùng để kết luận tình trạng sức khỏe.' if draft else {
        'Không đáng kể / Rất nhẹ': 'Kết quả ghi nhận ít biểu hiện khó khăn trong phạm vi bài đánh giá. Điều này không phủ nhận những cảm xúc hoặc khó khăn bạn đang trải qua.',
        'Nhẹ': 'Kết quả ghi nhận một số biểu hiện khó khăn về cảm xúc. Bạn có thể dành thêm sự quan tâm cho nhịp sinh hoạt và những điều đang khiến mình mệt mỏi.',
        'Vừa': 'Kết quả ghi nhận mức khó khăn đáng được quan tâm. Trao đổi với người có chuyên môn có thể giúp bạn hiểu rõ hơn những điều đang trải qua.',
        'Nặng': 'Kết quả ghi nhận nhiều biểu hiện khó khăn trong phạm vi bài đánh giá. Bạn nên sớm tìm hỗ trợ chuyên môn để được lắng nghe và đánh giá đầy đủ hơn.',
    }.get(level, f'Kết quả được hệ thống xếp ở mức “{level}”.'))
    suggestions = ['Chọn một việc nhỏ để chăm sóc mình hôm nay, như ăn đúng bữa hoặc dành thời gian nghỉ.', 'Chia sẻ với một người bạn tin cậy về điều bạn đang cảm thấy.']
    if level in ('Vừa', 'Nặng'):
        suggestions.append('Cân nhắc sớm hẹn gặp chuyên gia tâm lý hoặc nhân viên y tế; bạn có thể nhờ người tin cậy đi cùng.')
    else:
        suggestions.append('Nếu khó khăn kéo dài hoặc ảnh hưởng học tập, sinh hoạt, hãy trao đổi với chuyên gia tâm lý.')
    return {
        'greeting': 'Cảm ơn bạn đã dành thời gian hoàn thành 21 câu hỏi và lắng nghe chính mình.',
        'explanation': explanation + ' Kết quả này không phải là chẩn đoán.',
        'encouragement': 'Việc nhìn lại cảm xúc có thể không dễ. Bạn đã dành một khoảng thời gian cho bản thân, và bạn không cần tự xoay xở mọi điều một mình.',
        'suggestions': suggestions,
        'closing': 'Bạn có thể đi từng bước nhỏ, theo nhịp của mình. Lạc Lạc sẵn sàng lắng nghe nếu bạn muốn chia sẻ thêm.',
        'safety_message': ('Ngay lúc này, bạn có đang an toàn không? Nếu bạn có thể làm hại bản thân hoặc đã bị thương, hãy đến gần một người đáng tin cậy, nhờ họ ở cùng và tìm trợ giúp y tế khẩn cấp tại nơi bạn đang ở. Bạn có thể mở mục hỗ trợ ngay bên dưới.' if risk else None),
    }

LEVEL_CONTENT = {
    'Không đáng kể / Rất nhẹ': {
        'title': 'Bạn đang có ít dấu hiệu đáng lo ngại qua bài đánh giá',
        'message': 'Cảm ơn bạn đã dành thời gian lắng nghe cảm xúc của chính mình. Kết quả hiện tại cho thấy bạn ghi nhận tương đối ít dấu hiệu khó khăn về tâm trạng. Dù vậy, những ngày mệt mỏi và cảm xúc của bạn vẫn luôn đáng được quan tâm.',
        'tips': ['Duy trì giấc ngủ và sinh hoạt điều độ.', 'Dành thời gian cho những hoạt động yêu thích.', 'Chia sẻ cảm xúc khi cần.'],
    },
    'Nhẹ': {
        'title': 'Có lẽ bạn đang trải qua một vài áp lực',
        'message': 'Lạc Lạc cảm ơn bạn vì đã hoàn thành bài đánh giá. Có thể gần đây bạn thấy mệt mỏi, căng thẳng hoặc suy nghĩ nhiều hơn bình thường. Bạn không cần phải lúc nào cũng mạnh mẽ; hãy cho phép bản thân nghỉ ngơi một chút nhé.',
        'tips': ['Nghỉ ngơi và giảm bớt áp lực khi có thể.', 'Chia sẻ với người đáng tin cậy.', 'Tìm kiếm hỗ trợ nếu cảm xúc tiêu cực kéo dài.'],
    },
    'Vừa': {
        'title': 'Cảm xúc của bạn đang cần được quan tâm nhiều hơn',
        'message': 'Có vẻ gần đây bạn đang trải qua không ít khó khăn về cảm xúc. Lạc Lạc biết rằng chia sẻ những điều trong lòng không hề dễ. Cảm ơn bạn đã dành thời gian nhìn lại bản thân; cảm xúc của bạn xứng đáng được lắng nghe.',
        'tips': ['Tâm sự với người mà bạn tin tưởng.', 'Cân bằng học tập, nghỉ ngơi và sinh hoạt.', 'Chủ động tìm chuyên viên tâm lý hoặc nhân viên y tế để được đánh giá thêm.'],
    },
    'Nặng': {
        'title': 'Bạn xứng đáng nhận được sự quan tâm và hỗ trợ',
        'message': 'Cảm ơn bạn đã hoàn thành bài đánh giá. Bạn có thể đang trải qua những khó khăn đáng kể về cảm xúc. Đối diện với những điều ấy đôi khi rất khó. Bạn không cần tự giải quyết tất cả; tìm kiếm sự giúp đỡ là một bước chăm sóc bản thân.',
        'tips': ['Chia sẻ với người thân hoặc người đáng tin cậy.', 'Sớm liên hệ chuyên gia sức khỏe tâm thần hoặc cơ sở y tế để được hỗ trợ.', 'Nếu cảm thấy không an toàn, hãy tìm người hỗ trợ trực tiếp và liên hệ dịch vụ khẩn cấp tại địa phương.'],
    },
}


def result_guidance(result, draft=False):
    guidance = _base_guidance(result, draft)
    content = LEVEL_CONTENT[result['level']]
    guidance.update(title=content['title'], encouragement=content['message'], suggestions=content['tips'], closing='Bạn có thể đi từng bước nhỏ theo nhịp của mình. Lạc Lạc sẵn sàng lắng nghe khi bạn muốn chia sẻ thêm.')
    if draft:
        guidance.update(title='Một khoảng lặng để quan tâm đến cảm xúc của bạn', encouragement='Cảm ơn bạn đã nhìn lại cảm xúc của mình. Bài dùng thử chưa thể xác định tình trạng sức khỏe của bạn, nhưng những điều bạn đang trải qua vẫn xứng đáng được lắng nghe. Bạn có thể chia sẻ thêm với Lạc Lạc hoặc tìm một người tin cậy để cùng trò chuyện.')
    return guidance

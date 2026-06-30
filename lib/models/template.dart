class Template {
  final String id;
  final String name;
  final int columnCount;
  final List<TemplateColumn> columns;

  Template({
    required this.id,
    required this.name,
    required this.columnCount,
    required this.columns,
  });

  factory Template.fromJson(Map<String, dynamic> json) {
    return Template(
      id: json['id'] as String,
      name: json['name'] as String,
      columnCount: json['columnCount'] as int,
      columns: (json['columns'] as List)
          .map((c) => TemplateColumn.fromJson(c as Map<String, dynamic>))
          .toList(),
    );
  }
}

class TemplateColumn {
  final int index;
  final String header;
  final String type;
  final String description;

  TemplateColumn({
    required this.index,
    required this.header,
    required this.type,
    required this.description,
  });

  factory TemplateColumn.fromJson(Map<String, dynamic> json) {
    return TemplateColumn(
      index: json['index'] as int,
      header: json['header'] as String,
      type: json['type'] as String,
      description: json['description'] as String,
    );
  }
}

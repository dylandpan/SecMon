# iam.tf
# AWS Student Lab restriction: we cannot create IAM roles or policies.
# Look up the pre-existing LabRole and reference it everywhere.

data "aws_iam_role" "lab_role" {
  name = "LabRole"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-ec2-profile"
  role = data.aws_iam_role.lab_role.name
}
